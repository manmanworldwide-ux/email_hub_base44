import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getAppSettings } from "@/lib/auth/settings";
import type { AiIntegrationRow, LlmProvider } from "@/types/saas";
import { createAnthropicClient } from "./anthropic";
import { createGoogleClient } from "./google";
import { createOpenAiClient } from "./openai";
import { LlmError, type LlmClient, type LlmClientConfig } from "./types";

export * from "./types";

export interface ProviderInfo {
  id: LlmProvider;
  label: string;
  description: string;
  models: { id: string; label: string }[];
  needsApiKey: boolean;
  needsBaseUrl: boolean;
  keyPlaceholder: string;
  docsUrl: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic Claude",
    description: "Best overall quality for analysis and the assistant.",
    models: [
      { id: "claude-opus-5", label: "Claude Opus 5 (recommended)" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5 (fast, lower cost)" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (cheapest)" },
    ],
    needsApiKey: true,
    needsBaseUrl: false,
    keyPlaceholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT models via the OpenAI API.",
    models: [
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-5-mini", label: "GPT-5 mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    ],
    needsApiKey: true,
    needsBaseUrl: false,
    keyPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "google",
    label: "Google Gemini",
    description: "Gemini models via Google AI Studio.",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
    needsApiKey: true,
    needsBaseUrl: false,
    keyPlaceholder: "AIza...",
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "openai_compatible",
    label: "OpenAI-compatible endpoint",
    description: "Groq, Mistral, Together, Azure OpenAI, Ollama, LM Studio or any server speaking the Chat Completions API.",
    models: [],
    needsApiKey: false,
    needsBaseUrl: true,
    keyPlaceholder: "optional",
    docsUrl: "",
  },
];

export function providerInfo(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function createLlmClient(config: LlmClientConfig): LlmClient {
  switch (config.provider) {
    case "anthropic":
      return createAnthropicClient(config);
    case "openai":
    case "openai_compatible":
      return createOpenAiClient(config);
    case "google":
      return createGoogleClient(config);
    default:
      throw new ApiError(400, `Unsupported AI provider: ${String(config.provider)}`, "unsupported_provider");
  }
}

export function clientFromIntegration(row: AiIntegrationRow): LlmClient {
  return createLlmClient({
    provider: row.provider,
    model: row.model,
    apiKey: row.api_key_enc ? decrypt(row.api_key_enc) : null,
    baseUrl: row.base_url,
    label: row.label,
  });
}

export interface PlatformAiStatus {
  configured: boolean;
  allowed: boolean;
  model: string;
}

export async function platformAiStatus(db?: SupabaseClient): Promise<PlatformAiStatus> {
  const settings = await getAppSettings(db);
  return { configured: env.ai.configured, allowed: settings.allow_platform_ai, model: env.ai.model };
}

export interface ResolvedLlm {
  client: LlmClient;
  source: "integration" | "platform";
  integrationId: string | null;
}

/**
 * Picks the LLM for a user: their default enabled integration, else the platform's Anthropic key
 * (when the admin allows it), else a 503 explaining how to configure one.
 */
export async function resolveLlmForUser(db: SupabaseClient, userId: string, purpose: "assistant" | "analysis" = "assistant"): Promise<ResolvedLlm> {
  const { data } = await db
    .from("ai_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = data as AiIntegrationRow | null;
  if (row) return { client: clientFromIntegration(row), source: "integration", integrationId: row.id };

  const platform = await platformAiStatus(db);
  if (platform.configured && platform.allowed) {
    const model = purpose === "analysis" ? env.ai.analysisModel : env.ai.model;
    return {
      client: createAnthropicClient({ provider: "anthropic", model, apiKey: null, label: `Platform · ${model}` }),
      source: "platform",
      integrationId: null,
    };
  }
  throw new ApiError(
    503,
    platform.configured
      ? "AI is not enabled for your account. Add an AI integration in Settings → AI."
      : "No AI provider configured. Add an AI integration in Settings → AI.",
    "ai_not_configured",
  );
}

export async function hasLlmForUser(db: SupabaseClient, userId: string): Promise<boolean> {
  try {
    await resolveLlmForUser(db, userId);
    return true;
  } catch {
    return false;
  }
}

/** Maps provider errors into API errors with sensible HTTP statuses. */
export function toApiError(error: unknown): never {
  if (error instanceof LlmError) {
    const status = error.status === 401 ? 503 : error.status === 429 ? 429 : error.status === 400 ? 400 : 502;
    throw new ApiError(status, error.message, error.code);
  }
  if (error instanceof ApiError) throw error;
  throw error;
}
