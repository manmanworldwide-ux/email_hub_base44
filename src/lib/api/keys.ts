import type { SupabaseClient } from "@supabase/supabase-js";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { ALL_SCOPES, API_KEY_PREFIX } from "@/lib/api/auth";
import { ApiError, notFound } from "@/lib/api/errors";
import type { ApiKeyPublic } from "@/types";

const PUBLIC_COLUMNS = "id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at";

export function generateApiKey(): { token: string; prefix: string; hash: string } {
  const token = `${API_KEY_PREFIX}live_${randomToken(32)}`;
  return { token, prefix: token.slice(0, 16), hash: sha256Hex(token) };
}

export interface CreateApiKeyInput {
  name: string;
  scopes?: string[];
  expiresInDays?: number | null;
}

export async function createApiKey(
  db: SupabaseClient,
  userId: string,
  input: CreateApiKeyInput,
): Promise<{ key: ApiKeyPublic; token: string }> {
  const scopes = input.scopes && input.scopes.length > 0 ? input.scopes : [...ALL_SCOPES];
  const invalid = scopes.filter((s) => s !== "*" && !(ALL_SCOPES as readonly string[]).includes(s));
  if (invalid.length) throw new ApiError(400, `Unknown scopes: ${invalid.join(", ")}`, "invalid_scope");

  const { token, prefix, hash } = generateApiKey();
  const expires_at = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
    : null;

  const { data, error } = await db
    .from("api_keys")
    .insert({ user_id: userId, name: input.name, key_prefix: prefix, key_hash: hash, scopes, expires_at })
    .select(PUBLIC_COLUMNS)
    .single();

  if (error) throw new ApiError(500, `Failed to create API key: ${error.message}`);
  return { key: data as ApiKeyPublic, token };
}

export async function listApiKeys(db: SupabaseClient, userId: string): Promise<ApiKeyPublic[]> {
  const { data, error } = await db
    .from("api_keys")
    .select(PUBLIC_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(500, error.message);
  return (data ?? []) as ApiKeyPublic[];
}

export async function revokeApiKey(db: SupabaseClient, userId: string, id: string): Promise<ApiKeyPublic> {
  const { data, error } = await db
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select(PUBLIC_COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound("API key not found");
  return data as ApiKeyPublic;
}
