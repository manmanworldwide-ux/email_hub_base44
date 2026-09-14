import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { encrypt } from "@/lib/crypto";
import { createLlmClient, LlmError, providerInfo } from "@/lib/ai/llm";
import { AI_INTEGRATION_PUBLIC_COLUMNS, type AiIntegrationPublic, type AiIntegrationRow, type LlmProvider } from "@/types/saas";

export async function listIntegrations(db: SupabaseClient, userId: string): Promise<AiIntegrationPublic[]> {
  const { data, error } = await db
    .from("ai_integrations")
    .select(AI_INTEGRATION_PUBLIC_COLUMNS)
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new ApiError(500, error.message);
  return (data ?? []) as AiIntegrationPublic[];
}

export interface CreateIntegrationInput {
  provider: LlmProvider;
  label?: string;
  model: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  makeDefault?: boolean;
}

function hint(key: string | null | undefined): string | null {
  if (!key) return null;
  return key.length > 8 ? `…${key.slice(-4)}` : "••••";
}

export async function createIntegration(db: SupabaseClient, userId: string, input: CreateIntegrationInput): Promise<AiIntegrationPublic> {
  const info = providerInfo(input.provider);
  if (!info) throw badRequest("Unknown provider", "unsupported_provider");
  if (info.needsApiKey && !input.apiKey) throw badRequest(`${info.label} requires an API key`);
  if (info.needsBaseUrl && !input.baseUrl) throw badRequest(`${info.label} requires a base URL`);
  if (input.baseUrl && !/^https?:\/\//i.test(input.baseUrl)) throw badRequest("Base URL must start with http:// or https://");
  if (!input.model.trim()) throw badRequest("Model is required");

  const existing = await listIntegrations(db, userId);
  const makeDefault = input.makeDefault ?? existing.length === 0;
  if (makeDefault) await db.from("ai_integrations").update({ is_default: false }).eq("user_id", userId).eq("is_default", true);

  const { data, error } = await db
    .from("ai_integrations")
    .insert({
      user_id: userId,
      provider: input.provider,
      label: input.label?.trim() || `${info.label} · ${input.model}`,
      model: input.model.trim(),
      api_key_enc: encrypt(input.apiKey ?? ""),
      key_hint: hint(input.apiKey),
      base_url: input.baseUrl?.trim() || null,
      is_default: makeDefault,
    })
    .select(AI_INTEGRATION_PUBLIC_COLUMNS)
    .single();
  if (error) throw new ApiError(500, `Failed to save integration: ${error.message}`);
  return data as AiIntegrationPublic;
}

export interface UpdateIntegrationInput {
  label?: string;
  model?: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  enabled?: boolean;
  makeDefault?: boolean;
}

export async function updateIntegration(db: SupabaseClient, userId: string, id: string, input: UpdateIntegrationInput): Promise<AiIntegrationPublic> {
  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) patch.label = input.label.trim();
  if (input.model !== undefined) patch.model = input.model.trim();
  if (input.baseUrl !== undefined) patch.base_url = input.baseUrl?.trim() || null;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.apiKey) {
    patch.api_key_enc = encrypt(input.apiKey);
    patch.key_hint = hint(input.apiKey);
    patch.last_tested_at = null;
    patch.last_test_ok = null;
    patch.last_error = null;
  }
  if (input.makeDefault) {
    await db.from("ai_integrations").update({ is_default: false }).eq("user_id", userId).eq("is_default", true);
    patch.is_default = true;
    patch.enabled = true;
  }
  const { data, error } = await db
    .from("ai_integrations")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select(AI_INTEGRATION_PUBLIC_COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound("Integration not found");
  return data as AiIntegrationPublic;
}

export async function deleteIntegration(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error, count } = await db.from("ai_integrations").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  if (error) throw new ApiError(500, error.message);
  if (!count) throw notFound("Integration not found");
}

export async function testIntegration(db: SupabaseClient, userId: string, id: string) {
  const { data, error } = await db.from("ai_integrations").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  const row = data as AiIntegrationRow | null;
  if (!row) throw notFound("Integration not found");

  const { decrypt } = await import("@/lib/crypto");
  const client = createLlmClient({
    provider: row.provider,
    model: row.model,
    apiKey: row.api_key_enc ? decrypt(row.api_key_enc) : null,
    baseUrl: row.base_url,
    label: row.label,
  });

  try {
    const result = await client.ping();
    await db
      .from("ai_integrations")
      .update({ last_tested_at: new Date().toISOString(), last_test_ok: true, last_error: null })
      .eq("id", id);
    return { ok: true as const, latency_ms: result.latency_ms, model: result.model };
  } catch (err) {
    const message = err instanceof LlmError || err instanceof Error ? err.message : String(err);
    await db
      .from("ai_integrations")
      .update({ last_tested_at: new Date().toISOString(), last_test_ok: false, last_error: message.slice(0, 500) })
      .eq("id", id);
    return { ok: false as const, error: message };
  }
}
