import {
  LlmError,
  newCallId,
  parseJsonLoose,
  type JsonSchema,
  type LlmChatOptions,
  type LlmClient,
  type LlmClientConfig,
  type LlmJsonOptions,
  type LlmMessage,
  type LlmPart,
  type LlmTurn,
} from "./types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
}

const ALLOWED_KEYS = new Set(["type", "format", "description", "nullable", "enum", "properties", "required", "items", "minItems", "maxItems", "minimum", "maximum", "anyOf"]);

/** Gemini accepts an OpenAPI-style subset of JSON Schema; strip everything else. */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const src = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (key === "type" && Array.isArray(value)) {
      const types = value.filter((t) => t !== "null");
      out.type = types[0] ?? "string";
      if (value.includes("null")) out.nullable = true;
    } else if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toGeminiSchema(v)]));
    } else if (key === "items" || key === "anyOf") {
      out[key] = toGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }
  if (out.type === "object" && !out.properties) out.properties = {};
  return out;
}

function tryParse(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { result: parsed };
  } catch {
    return { result: text };
  }
}

function toContents(messages: LlmMessage[]) {
  return messages.map((m) => {
    const parts: GeminiPart[] = [];
    for (const p of m.parts) {
      if (p.type === "text") {
        if (p.text.trim()) parts.push({ text: p.text });
      } else if (p.type === "tool_call") {
        parts.push({ functionCall: { name: p.name, args: p.input } });
      } else {
        parts.push({ functionResponse: { name: p.name, response: p.is_error ? { error: p.content } : tryParse(p.content) } });
      }
    }
    if (!parts.length) parts.push({ text: "(empty)" });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
}

export function createGoogleClient(config: LlmClientConfig): LlmClient {
  const model = config.model;

  async function request(path: string, body: Record<string, unknown>): Promise<GeminiResponse> {
    if (!config.apiKey) throw new LlmError("google", 401, "Google AI API key is missing", "ai_auth_error");
    const response = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await response.text();
    let json: GeminiResponse & { error?: { message?: string; status?: string } } = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!response.ok) {
      const message = json.error?.message ?? text.slice(0, 300);
      if (response.status === 401 || response.status === 403) throw new LlmError("google", 401, `Google AI key rejected: ${message}`, "ai_auth_error");
      if (response.status === 429) throw new LlmError("google", 429, `Google AI rate limit: ${message}`, "ai_rate_limited");
      throw new LlmError("google", response.status, `Google AI error: ${message}`, response.status === 400 ? "ai_bad_request" : "ai_upstream_error");
    }
    return json;
  }

  function usageOf(data: GeminiResponse) {
    return { input_tokens: data.usageMetadata?.promptTokenCount ?? 0, output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0 };
  }

  return {
    provider: "google",
    model,
    label: config.label ?? `Google · ${model}`,

    async chat(options: LlmChatOptions): Promise<LlmTurn> {
      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: options.system.join("\n\n") }] },
        contents: toContents(options.messages),
        generationConfig: { maxOutputTokens: options.maxTokens ?? 8192 },
      };
      if (options.tools?.length) {
        body.tools = [
          {
            functionDeclarations: options.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: toGeminiSchema(t.input_schema),
            })),
          },
        ];
      }
      const data = await request("generateContent", body);
      if (data.promptFeedback?.blockReason) {
        return {
          message: { role: "assistant", parts: [{ type: "text", text: `Request blocked (${data.promptFeedback.blockReason}).` }] },
          stop: "refusal",
          usage: usageOf(data),
          model,
        };
      }
      const candidate = data.candidates?.[0];
      const parts: LlmPart[] = [];
      for (const p of candidate?.content?.parts ?? []) {
        if ("text" in p && p.text) parts.push({ type: "text", text: p.text });
        else if ("functionCall" in p) parts.push({ type: "tool_call", id: newCallId(), name: p.functionCall.name, input: p.functionCall.args ?? {} });
      }
      const hasCalls = parts.some((p) => p.type === "tool_call");
      const finish = candidate?.finishReason;
      const stop = hasCalls ? "tool_calls" : finish === "MAX_TOKENS" ? "max_tokens" : finish === "SAFETY" || finish === "PROHIBITED_CONTENT" ? "refusal" : finish === "STOP" || !finish ? "end" : "other";
      return { message: { role: "assistant", parts }, stop, usage: usageOf(data), model: data.modelVersion ?? model };
    },

    async generateJson(options: LlmJsonOptions) {
      const data = await request("generateContent", {
        systemInstruction: { parts: [{ text: options.system }] },
        contents: [{ role: "user", parts: [{ text: options.user }] }],
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? 4096,
          responseMimeType: "application/json",
          responseSchema: toGeminiSchema(options.schema as JsonSchema),
        },
      });
      if (data.promptFeedback?.blockReason) throw new LlmError("google", 502, "The model declined this request", "ai_refusal");
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => ("text" in p ? p.text : "")).join("");
      return { data: parseJsonLoose(text), usage: usageOf(data), model: data.modelVersion ?? model };
    },

    async ping() {
      const started = Date.now();
      const data = await request("generateContent", {
        contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
        generationConfig: { maxOutputTokens: 16 },
      });
      return { ok: true as const, latency_ms: Date.now() - started, model: data.modelVersion ?? model };
    },
  };
}
