import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createUserTokenClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sha256Hex } from "@/lib/crypto";
import { ApiError, forbidden, unauthorized } from "@/lib/api/errors";
import { loadProfile } from "@/lib/auth/session";
import type { ApiKeyRow } from "@/types";
import type { ProfileRow, UserRole, UserStatus } from "@/types/saas";

export const ALL_SCOPES = [
  "accounts:read",
  "accounts:write",
  "emails:read",
  "emails:write",
  "calendar:read",
  "calendar:write",
  "ai:use",
  "analytics:read",
  "sync:trigger",
] as const;

export type Scope = (typeof ALL_SCOPES)[number];

export const SCOPE_DESCRIPTIONS: Record<Scope, string> = {
  "accounts:read": "List connected mailboxes",
  "accounts:write": "Disconnect mailboxes",
  "emails:read": "Read and search emails and their AI analysis",
  "emails:write": "Send, reply, mark read/starred",
  "calendar:read": "Read calendar events",
  "calendar:write": "Create and delete calendar events / meetings",
  "ai:use": "Run AI analysis and the AI assistant",
  "analytics:read": "Read analytics summaries",
  "sync:trigger": "Trigger mailbox synchronisation",
};

export const API_KEY_PREFIX = "ehk_";

export type AuthMethod = "api_key" | "session" | "supabase_jwt";

export interface AuthContext {
  userId: string;
  email: string | null;
  method: AuthMethod;
  scopes: string[];
  apiKeyId: string | null;
  apiKeyName: string | null;
  role: UserRole;
  status: UserStatus;
  canCreateApiKeys: boolean;
  profile: ProfileRow | null;
  /** Supabase client to use for this request. RLS applies for session/JWT auth; service role for API keys. */
  db: SupabaseClient;
}

function extractToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header) {
    const [scheme, value] = header.split(" ");
    if (scheme?.toLowerCase() === "bearer" && value) return value.trim();
  }
  const apiKey = request.headers.get("x-api-key");
  return apiKey ? apiKey.trim() : null;
}

async function withProfile(base: Omit<AuthContext, "role" | "status" | "canCreateApiKeys" | "profile">): Promise<AuthContext> {
  const profile = await loadProfile(base.userId, base.email);
  const status = profile?.status ?? "active";
  if (status === "disabled") throw forbidden("This account has been disabled", "account_disabled");
  return {
    ...base,
    role: profile?.role ?? "member",
    status,
    canCreateApiKeys: profile?.can_create_api_keys ?? false,
    profile,
  };
}

async function authenticateApiKey(token: string): Promise<AuthContext> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("api_keys").select("*").eq("key_hash", sha256Hex(token)).is("revoked_at", null).maybeSingle();
  if (error) throw new ApiError(500, `Failed to validate API key: ${error.message}`, "auth_error");
  const key = data as ApiKeyRow | null;
  if (!key) throw unauthorized("Invalid API key", "invalid_api_key");
  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) throw unauthorized("API key has expired", "api_key_expired");

  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);

  return withProfile({
    userId: key.user_id,
    email: null,
    method: "api_key",
    scopes: key.scopes,
    apiKeyId: key.id,
    apiKeyName: key.name,
    db: admin,
  });
}

async function authenticateSupabaseJwt(token: string): Promise<AuthContext> {
  const admin = createAdminClient();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) throw unauthorized("Invalid or expired access token", "invalid_token");
  return withProfile({
    userId: user.id,
    email: user.email ?? null,
    method: "supabase_jwt",
    scopes: [...ALL_SCOPES],
    apiKeyId: null,
    apiKeyName: null,
    db: createUserTokenClient(token),
  });
}

async function authenticateSession(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw unauthorized();
  return withProfile({
    userId: user.id,
    email: user.email ?? null,
    method: "session",
    scopes: [...ALL_SCOPES],
    apiKeyId: null,
    apiKeyName: null,
    db: supabase,
  });
}

/**
 * Resolves the caller from (in order): an `ehk_` API key (Authorization: Bearer or x-api-key),
 * a Supabase access token (Authorization: Bearer <jwt>), or the browser session cookie.
 */
export async function authenticate(request: Request): Promise<AuthContext> {
  const token = extractToken(request);
  if (token) {
    if (token.startsWith(API_KEY_PREFIX)) return authenticateApiKey(token);
    if (token.split(".").length === 3) return authenticateSupabaseJwt(token);
    throw unauthorized("Unrecognised credential", "invalid_token");
  }
  return authenticateSession();
}

export function requireScope(ctx: AuthContext, scope: Scope): void {
  if (ctx.method !== "api_key") return;
  if (ctx.scopes.includes("*") || ctx.scopes.includes(scope)) return;
  throw forbidden(`API key is missing the required scope: ${scope}`, "insufficient_scope");
}

/** Some operations (managing API keys, AI integrations, admin) must never be possible with an API key itself. */
export function requireInteractive(ctx: AuthContext): void {
  if (ctx.method === "api_key") {
    throw forbidden("This endpoint requires an interactive login, not an API key", "interactive_required");
  }
}

export function requireAdmin(ctx: AuthContext): void {
  requireInteractive(ctx);
  if (ctx.role !== "admin") throw forbidden("Administrator access required", "admin_only");
}

export function requireApiKeyPermission(ctx: AuthContext): void {
  requireInteractive(ctx);
  if (ctx.role !== "admin" && !ctx.canCreateApiKeys) {
    throw forbidden("API token generation is not enabled for your account. Ask an administrator to enable it.", "api_keys_disabled");
  }
}
