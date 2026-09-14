import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { encrypt } from "@/lib/crypto";
import { getConnectorStatus, invalidateConnectorCache, type ConnectorRow, type ConnectorStatus } from "@/lib/providers/credentials";
import type { Provider } from "@/types";

export interface UpsertConnectorInput {
  provider: Provider;
  clientId: string;
  clientSecret?: string | null;
  tenant?: string | null;
  enabled?: boolean;
}

/** Admin: saves OAuth client credentials for a provider. Omitting the secret keeps the stored one. */
export async function upsertConnector(db: SupabaseClient, adminId: string, input: UpsertConnectorInput): Promise<ConnectorStatus> {
  const clientId = input.clientId.trim();
  if (!clientId) throw badRequest("Client ID is required");
  if (input.provider === "google" && !/apps\.googleusercontent\.com$/.test(clientId)) {
    throw badRequest("A Google client ID normally ends with .apps.googleusercontent.com - check you copied the Client ID, not the project number");
  }
  if (input.provider === "microsoft" && !/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw badRequest("A Microsoft Application (client) ID is a GUID like 12345678-1234-1234-1234-123456789abc");
  }

  const { data: existing } = await db.from("oauth_connectors").select("*").eq("provider", input.provider).maybeSingle();
  const row = existing as ConnectorRow | null;
  const secret = input.clientSecret?.trim();
  if (!secret && !row) throw badRequest("Client secret is required");

  const payload: Record<string, unknown> = {
    provider: input.provider,
    client_id: clientId,
    tenant: input.provider === "microsoft" ? input.tenant?.trim() || "common" : null,
    enabled: input.enabled ?? true,
    updated_at: new Date().toISOString(),
    updated_by: adminId,
  };
  if (secret) payload.client_secret_enc = encrypt(secret);

  const { error } = await db.from("oauth_connectors").upsert(payload, { onConflict: "provider" });
  if (error) throw new ApiError(500, `Failed to save connector: ${error.message}`);
  invalidateConnectorCache(input.provider);
  return getConnectorStatus(input.provider);
}

export async function deleteConnector(db: SupabaseClient, provider: Provider): Promise<ConnectorStatus> {
  const { error, count } = await db.from("oauth_connectors").delete({ count: "exact" }).eq("provider", provider);
  if (error) throw new ApiError(500, error.message);
  if (!count) throw notFound("No in-app credentials stored for this provider");
  invalidateConnectorCache(provider);
  return getConnectorStatus(provider);
}
