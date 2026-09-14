import Anthropic from "@anthropic-ai/sdk";
import {
  LlmError,
  parseJsonLoose,
  type LlmChatOptions,
  type LlmClient,
  type LlmClientConfig,
  type LlmJsonOptions,
  type LlmMessage,
  type LlmPart,
  type LlmTurn,
} from "./types";

/** `output_config.effort` exists on the 4.6+ generation; Haiku 4.5 and older reject it. */
export function supportsEffort(model: string): boolean {
  return /(opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|fable|mythos)/i.test(model);
}

function toAnthropicMessages(messages: LlmMessage[], model: string): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (m.role === "assistant" && m.raw?.provider === "anthropic" && m.raw.model === model && Array.isArray(m.raw.content)) {
      return { role: "assistant", content: m.raw.content as Anthropic.ContentBlockParam[] };
    }
    const blocks: Anthropic.ContentBlockParam[] = [];
    for (const part of m.parts) {
      if (part.type === "text") {
        if (part.text.trim()) blocks.push({ type: "text", text: part.text });
      } else if (part.type === "tool_call") {
        blocks.push({ type: "tool_use", id: part.id, name: part.name, input: part.input });
      } else {
        blocks.push({ type: "tool_result", tool_use_id: part.tool_call_id, content: part.content, is_error: part.is_error });
      }
    }
    if (!blocks.length) blocks.push({ type: "text", text: "(empty)" });
    return { role: m.role, content: blocks };
  });
}

function fromAnthropicContent(content: Anthropic.ContentBlock[]): LlmPart[] {
  const parts: LlmPart[] = [];
  for (const block of content) {
    if (block.type === "text") parts.push({ type: "text", text: block.text });
    else if (block.type === "tool_use") parts.push({ type: "tool_call", id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> });
  }
  return parts;
}

function mapError(error: unknown): never {
  if (error instanceof Anthropic.AuthenticationError) throw new LlmError("anthropic", 401, "Anthropic API key is invalid", "ai_auth_error");
  if (error instanceof Anthropic.RateLimitError) throw new LlmError("anthropic", 429, "Anthropic rate limit reached, retry shortly", "ai_rate_limited");
  if (error instanceof Anthropic.BadRequestError) throw new LlmError("anthropic", 400, `Anthropic rejected the request: ${error.message}`, "ai_bad_request");
  if (error instanceof Anthropic.APIError) throw new LlmError("anthropic", error.status ?? 502, `Anthropic error: ${error.message}`);
  throw error;
}

export function createAnthropicClient(config: LlmClientConfig): LlmClient {
  const client = config.apiKey ? new Anthropic({ apiKey: config.apiKey }) : new Anthropic();
  const model = config.model;

  return {
    provider: "anthropic",
    model,
    label: config.label ?? `Anthropic · ${model}`,

    async chat(options: LlmChatOptions): Promise<LlmTurn> {
      const [stable, ...volatile] = options.system;
      const system: Anthropic.TextBlockParam[] = [
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
        ...volatile.map((text) => ({ type: "text" as const, text })),
      ];
      try {
        const response = await client.messages.create({
          model,
          max_tokens: options.maxTokens ?? 8192,
          system,
          messages: toAnthropicMessages(options.messages, model),
          ...(options.tools?.length
            ? { tools: options.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Tool["input_schema"] })) }
            : {}),
          ...(options.effort && supportsEffort(model) ? { output_config: { effort: options.effort } } : {}),
        });
        const stop =
          response.stop_reason === "tool_use"
            ? "tool_calls"
            : response.stop_reason === "end_turn" || response.stop_reason === "stop_sequence"
              ? "end"
              : response.stop_reason === "max_tokens"
                ? "max_tokens"
                : response.stop_reason === "refusal"
                  ? "refusal"
                  : response.stop_reason === "pause_turn"
                    ? "continue"
                    : "other";
        return {
          message: {
            role: "assistant",
            parts: fromAnthropicContent(response.content),
            raw: { provider: "anthropic", model, content: response.content },
          },
          stop,
          usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
          model: response.model,
        };
      } catch (error) {
        return mapError(error);
      }
    },

    async generateJson(options: LlmJsonOptions) {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: options.maxTokens ?? 4096,
          system: [{ type: "text", text: options.system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: options.user }],
          output_config: {
            ...(supportsEffort(model) ? { effort: "low" as const } : {}),
            format: { type: "json_schema", schema: options.schema },
          },
        });
        if (response.stop_reason === "refusal") throw new LlmError("anthropic", 502, "The model declined this request", "ai_refusal");
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        return {
          data: parseJsonLoose(text),
          usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
          model: response.model,
        };
      } catch (error) {
        if (error instanceof LlmError) throw error;
        return mapError(error);
      }
    },

    async ping() {
      const started = Date.now();
      try {
        const response = await client.messages.create({
          model,
          max_tokens: 16,
          messages: [{ role: "user", content: "Reply with the single word OK." }],
        });
        return { ok: true as const, latency_ms: Date.now() - started, model: response.model };
      } catch (error) {
        return mapError(error);
      }
    },
  };
}
