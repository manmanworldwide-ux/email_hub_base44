import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Provider } from "@/types";

export interface OAuthCredentials {
  provider: Provider;
  clientId: string;
  clientSecret: string;
  tenant: string;
  source: "app" | "env";
}

export interface ConnectorRow {
  provider: Provider;
  client_id: string;
  client_secret_enc: string;
  tenant: string | null;
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface ConnectorStatus {
  provider: Provider;
  label: string;
  configured: boolean;
  source: "app" | "env" | null;
  client_id: string | null;
  tenant: string | null;
  enabled: boolean;
  updated_at: string | null;
  redirect_uri: string;
}

export const PROVIDER_LABELS: Record<Provider, string> = { google: "Gmail (Google)", microsoft: "Outlook (Microsoft)" };
export const PROVIDERS_LIST: Provider[] = ["google", "microsoft"];

const TTL_MS = 30_000;
const cache = new Map<Provider, { at: number; row: ConnectorRow | null }>();

export function invalidateConnectorCache(provider?: Provider) {
  if (provider) cache.delete(provider);
  else cache.clear();
}

async function loadRow(provider: Provider): Promise<ConnectorRow | null> {
  const cached = cache.get(provider);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.row;
  let row: ConnectorRow | null = null;
  if (env.supabaseConfigured) {
    try {
      const { data } = await createAdminClient().from("oauth_connectors").select("*").eq("provider", provider).maybeSingle();
      row = (data as ConnectorRow | null) ?? null;
    } catch (error) {
      console.warn(`[connectors] failed to load ${provider} credentials`, error);
    }
  }
  cache.set(provider, { at: Date.now(), row });
  return row;
}

function envCredentials(provider: Provider): OAuthCredentials | null {
  if (provider === "google") {
    return env.google.configured
      ? { provider, clientId: env.google.clientId, clientSecret: env.google.clientSecret, tenant: "common", source: "env" }
      : null;
  }
  return env.microsoft.configured
    ? { provider, clientId: env.microsoft.clientId, clientSecret: env.microsoft.clientSecret, tenant: env.microsoft.tenant, source: "env" }
    : null;
}

/** Credentials configured in-app by an administrator take precedence over environment variables. */
export async function getOAuthCredentials(provider: Provider): Promise<OAuthCredentials | null> {
  const row = await loadRow(provider);
  if (row?.enabled && row.client_id && row.client_secret_enc) {
    try {
      return { provider, clientId: row.client_id, clientSecret: decrypt(row.client_secret_enc), tenant: row.tenant || "common", source: "app" };
    } catch (error) {
      console.warn(`[connectors] cannot decrypt ${provider} client secret (TOKEN_ENCRYPTION_KEY changed?)`, error);
    }
  }
  return envCredentials(provider);
}

export async function requireOAuthCredentials(provider: Provider): Promise<OAuthCredentials> {
  const creds = await getOAuthCredentials(provider);
  if (!creds) {
    throw new ApiError(
      503,
      `${PROVIDER_LABELS[provider]} is not set up yet. An administrator must add the OAuth client under Administration → Mail connectors.`,
      "provider_not_configured",
    );
  }
  return creds;
}

export function redirectUriFor(provider: Provider): string {
  return `${env.appUrl}/api/auth/${provider}/callback`;
}

export async function getConnectorStatus(provider: Provider): Promise<ConnectorStatus> {
  const row = await loadRow(provider);
  const fromEnv = envCredentials(provider);
  const appConfigured = Boolean(row?.enabled && row.client_id && row.client_secret_enc);
  return {
    provider,
    label: PROVIDER_LABELS[provider],
    configured: appConfigured || Boolean(fromEnv),
    source: appConfigured ? "app" : fromEnv ? "env" : null,
    client_id: row?.client_id ?? fromEnv?.clientId ?? null,
    tenant: provider === "microsoft" ? (row?.tenant ?? fromEnv?.tenant ?? "common") : null,
    enabled: row ? row.enabled : Boolean(fromEnv),
    updated_at: row?.updated_at ?? null,
    redirect_uri: redirectUriFor(provider),
  };
}

export async function getAllConnectorStatus(): Promise<Record<Provider, ConnectorStatus>> {
  const [google, microsoft] = await Promise.all([getConnectorStatus("google"), getConnectorStatus("microsoft")]);
  return { google, microsoft };
}

export async function providerAvailability(): Promise<Record<Provider, boolean>> {
  const status = await getAllConnectorStatus();
  return { google: status.google.configured, microsoft: status.microsoft.configured };
}
