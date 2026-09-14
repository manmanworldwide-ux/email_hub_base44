import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import { ApiError, notFound } from "@/lib/api/errors";
import { getProvider, ProviderHttpError } from "@/lib/providers";
import { ACCOUNT_PUBLIC_COLUMNS, type AccountPublic, type ConnectedAccountRow, type Provider, type TokenSet } from "@/types";
import type { ProviderProfile } from "@/types";

export async function listAccounts(db: SupabaseClient, userId: string): Promise<AccountPublic[]> {
  const { data, error } = await db
    .from("connected_accounts")
    .select(ACCOUNT_PUBLIC_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new ApiError(500, error.message);
  return (data ?? []) as AccountPublic[];
}

export async function getAccountPublic(db: SupabaseClient, userId: string, accountId: string): Promise<AccountPublic> {
  const { data, error } = await db
    .from("connected_accounts")
    .select(ACCOUNT_PUBLIC_COLUMNS)
    .eq("user_id", userId)
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound("Account not found");
  return data as AccountPublic;
}

/** Internal: full row including encrypted tokens. Never return this to clients. */
export async function getAccountRow(db: SupabaseClient, userId: string, accountId: string): Promise<ConnectedAccountRow> {
  const { data, error } = await db
    .from("connected_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound("Account not found");
  return data as ConnectedAccountRow;
}

export async function listAccountRows(db: SupabaseClient, userId: string): Promise<ConnectedAccountRow[]> {
  const { data, error } = await db.from("connected_accounts").select("*").eq("user_id", userId);
  if (error) throw new ApiError(500, error.message);
  return (data ?? []) as ConnectedAccountRow[];
}

export async function upsertAccountFromOAuth(
  db: SupabaseClient,
  userId: string,
  provider: Provider,
  profile: ProviderProfile,
  tokens: TokenSet,
): Promise<AccountPublic> {
  const existing = await db
    .from("connected_accounts")
    .select("id, refresh_token_enc")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("email", profile.email)
    .maybeSingle();

  const refreshEnc = tokens.refresh_token
    ? encrypt(tokens.refresh_token)
    : ((existing.data as { refresh_token_enc: string | null } | null)?.refresh_token_enc ?? null);

  const payload = {
    user_id: userId,
    provider,
    provider_account_id: profile.id,
    email: profile.email,
    display_name: profile.name,
    avatar_url: profile.avatar_url,
    access_token_enc: encrypt(tokens.access_token),
    refresh_token_enc: refreshEnc,
    token_expires_at: tokens.expires_at,
    scopes: tokens.scope,
    status: "active",
    last_error: null,
  };

  const { data, error } = await db
    .from("connected_accounts")
    .upsert(payload, { onConflict: "user_id,provider,email" })
    .select(ACCOUNT_PUBLIC_COLUMNS)
    .single();
  if (error) throw new ApiError(500, `Failed to save account: ${error.message}`);
  return data as AccountPublic;
}

export async function disconnectAccount(db: SupabaseClient, userId: string, accountId: string): Promise<void> {
  const { error, count } = await db
    .from("connected_accounts")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", accountId);
  if (error) throw new ApiError(500, error.message);
  if (!count) throw notFound("Account not found");
}

export async function markAccountStatus(
  db: SupabaseClient,
  accountId: string,
  status: ConnectedAccountRow["status"],
  lastError: string | null,
) {
  await db.from("connected_accounts").update({ status, last_error: lastError }).eq("id", accountId);
}

/**
 * Returns a valid access token for the account, refreshing (and persisting) it when
 * it is expired or about to expire.
 */
export async function getAccessToken(db: SupabaseClient, account: ConnectedAccountRow): Promise<string> {
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  const stillValid = expiresAt - Date.now() > 90_000;
  if (stillValid) return decrypt(account.access_token_enc);

  if (!account.refresh_token_enc) {
    await markAccountStatus(db, account.id, "needs_reauth", "No refresh token available. Please reconnect the account.");
    throw new ApiError(409, `Account ${account.email} needs to be reconnected`, "needs_reauth");
  }

  const provider = getProvider(account.provider);
  try {
    const tokens = await provider.refreshAccessToken(decrypt(account.refresh_token_enc));
    const update: Record<string, unknown> = {
      access_token_enc: encrypt(tokens.access_token),
      token_expires_at: tokens.expires_at,
      status: "active",
      last_error: null,
    };
    if (tokens.refresh_token) update.refresh_token_enc = encrypt(tokens.refresh_token);
    await db.from("connected_accounts").update(update).eq("id", account.id);
    account.access_token_enc = update.access_token_enc as string;
    account.token_expires_at = tokens.expires_at;
    return tokens.access_token;
  } catch (error) {
    if (error instanceof ProviderHttpError && error.isAuthError) {
      await markAccountStatus(db, account.id, "needs_reauth", error.message);
      throw new ApiError(409, `Account ${account.email} needs to be reconnected: ${error.message}`, "needs_reauth");
    }
    throw error;
  }
}
