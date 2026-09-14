import {
  LlmError,
  parseJsonLoose,
  textOfParts,
  type LlmChatOptions,
  type LlmClient,
  type LlmClientConfig,
  type LlmJsonOptions,
  type LlmMessage,
  type LlmPart,
  type LlmTurn,
} from "./types";
import type { LlmProvider } from "@/types/saas";

const OPENAI_BASE = "https://api.openai.com/v1";

interface ChatCompletionResponse {
  model?: string;
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
      refusal?: string | null;
      tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

type WireMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

function toWireMessages(system: string, messages: LlmMessage[]): WireMessage[] {
  const out: WireMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "assistant") {
      const toolCalls = m.parts
        .filter((p): p is Extract<LlmPart, { type: "tool_call" }> => p.type === "tool_call")
        .map((p) => ({ id: p.id, type: "function" as const, function: { name: p.name, arguments: JSON.stringify(p.input) } }));
      const text = textOfParts(m.parts);
      out.push({ role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
    } else {
      const texts: string[] = [];
      for (const p of m.parts) {
        if (p.type === "text") texts.push(p.text);
        else if (p.type === "tool_result") out.push({ role: "tool", tool_call_id: p.tool_call_id, content: p.content });
      }
      if (texts.length) out.push({ role: "user", content: texts.join("\n") });
    }
  }
  return out;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function createOpenAiClient(config: LlmClientConfig): LlmClient {
  const provider: LlmProvider = config.provider === "openai_compatible" ? "openai_compatible" : "openai";
  const base = (config.baseUrl?.replace(/\/$/, "") || OPENAI_BASE).replace(/\/chat\/completions$/, "");
  const model = config.model;
  const maxTokensKey = provider === "openai" ? "max_completion_tokens" : "max_tokens";

  async function request(body: Record<string, unknown>): Promise<ChatCompletionResponse> {
    if (!config.apiKey && provider === "openai") throw new LlmError(provider, 401, "OpenAI API key is missing", "ai_auth_error");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await response.text();
    let json: ChatCompletionResponse & { error?: { message?: string; code?: string } } = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!response.ok) {
      const message = json.error?.message ?? text.slice(0, 300) ?? `HTTP ${response.status}`;
      if (response.status === 401) throw new LlmError(provider, 401, `${provider} API key rejected: ${message}`, "ai_auth_error");
      if (response.status === 429) throw new LlmError(provider, 429, `${provider} rate limit: ${message}`, "ai_rate_limited");
      throw new LlmError(provider, response.status, `${provider} error: ${message}`, response.status === 400 ? "ai_bad_request" : "ai_upstream_error");
    }
    return json;
  }

  return {
    provider,
    model,
    label: config.label ?? `${provider === "openai" ? "OpenAI" : "OpenAI-compatible"} · ${model}`,

    async chat(options: LlmChatOptions): Promise<LlmTurn> {
      const body: Record<string, unknown> = {
        model,
        messages: toWireMessages(options.system.join("\n\n"), options.messages),
        [maxTokensKey]: options.maxTokens ?? 8192,
      };
      if (options.tools?.length) {
        body.tools = options.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
      }
      const data = await request(body);
      const choice = data.choices?.[0];
      const msg = choice?.message;
      const parts: LlmPart[] = [];
      if (msg?.content) parts.push({ type: "text", text: msg.content });
      for (const call of msg?.tool_calls ?? []) {
        parts.push({ type: "tool_call", id: call.id, name: call.function.name, input: parseArgs(call.function.arguments) });
      }
      const finish = choice?.finish_reason;
      const stop =
        msg?.tool_calls?.length
          ? "tool_calls"
          : finish === "length"
            ? "max_tokens"
            : finish === "content_filter" || msg?.refusal
              ? "refusal"
              : finish === "stop" || finish === undefined
                ? "end"
                : "other";
      if (msg?.refusal && !parts.length) parts.push({ type: "text", text: msg.refusal });
      return {
        message: { role: "assistant", parts },
        stop,
        usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 },
        model: data.model ?? model,
      };
    },

    async generateJson(options: LlmJsonOptions) {
      const messages: WireMessage[] = [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ];
      const strictBody = {
        model,
        messages,
        [maxTokensKey]: options.maxTokens ?? 4096,
        response_format: { type: "json_schema", json_schema: { name: options.schemaName ?? "result", schema: options.schema, strict: false } },
      };
      let data: ChatCompletionResponse;
      try {
        data = await request(strictBody);
      } catch (error) {
        // Some OpenAI-compatible servers only support json_object mode; fall back with the schema inlined.
        if (error instanceof LlmError && error.status === 400) {
          data = await request({
            model,
            messages: [
              { role: "system", content: `${options.system}\n\nRespond ONLY with JSON matching this JSON Schema:\n${JSON.stringify(options.schema)}` },
              { role: "user", content: options.user },
            ],
            [maxTokensKey]: options.maxTokens ?? 4096,
            response_format: { type: "json_object" },
          });
        } else {
          throw error;
        }
      }
      const choice = data.choices?.[0];
      if (choice?.finish_reason === "content_filter" || choice?.message?.refusal) {
        throw new LlmError(provider, 502, "The model declined this request", "ai_refusal");
      }
      const text = choice?.message?.content ?? "";
      return {
        data: parseJsonLoose(text),
        usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 },
        model: data.model ?? model,
      };
    },

    async ping() {
      const started = Date.now();
      const data = await request({
        model,
        messages: [{ role: "user", content: "Reply with the single word OK." }],
        [maxTokensKey]: 16,
      });
      return { ok: true as const, latency_ms: Date.now() - started, model: data.model ?? model };
    },
  };
}
