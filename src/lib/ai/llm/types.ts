import type { LlmProvider } from "@/types/saas";

export type JsonSchema = Record<string, unknown>;

export type LlmPart =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_call_id: string; name: string; content: string; is_error?: boolean };

export interface LlmMessage {
  role: "user" | "assistant";
  parts: LlmPart[];
  /** Provider-native content for lossless replay on the same provider (e.g. Claude thinking blocks). */
  raw?: { provider: LlmProvider; model: string; content: unknown };
}

export interface LlmTool {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
}

export type LlmStop = "end" | "tool_calls" | "max_tokens" | "refusal" | "continue" | "other";

export interface LlmTurn {
  message: LlmMessage;
  stop: LlmStop;
  usage: LlmUsage;
  model: string;
}

export interface LlmChatOptions {
  /** First entry is the stable system prompt (cacheable); later entries are volatile context. */
  system: string[];
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

export interface LlmJsonOptions {
  system: string;
  user: string;
  schema: JsonSchema;
  schemaName?: string;
  maxTokens?: number;
}

export interface LlmJsonResult {
  data: unknown;
  usage: LlmUsage;
  model: string;
}

export interface LlmClient {
  provider: LlmProvider;
  model: string;
  label: string;
  chat(options: LlmChatOptions): Promise<LlmTurn>;
  generateJson(options: LlmJsonOptions): Promise<LlmJsonResult>;
  ping(): Promise<{ ok: true; latency_ms: number; model: string }>;
}

export interface LlmClientConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string | null;
  baseUrl?: string | null;
  label?: string;
}

export class LlmError extends Error {
  provider: LlmProvider;
  status: number;
  code: string;

  constructor(provider: LlmProvider, status: number, message: string, code = "ai_upstream_error") {
    super(message);
    this.name = "LlmError";
    this.provider = provider;
    this.status = status;
    this.code = code;
  }
}

export function textOfParts(parts: LlmPart[]): string {
  return parts
    .filter((p): p is Extract<LlmPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

export function toolCallsOf(parts: LlmPart[]) {
  return parts.filter((p): p is Extract<LlmPart, { type: "tool_call" }> => p.type === "tool_call");
}

/** Extracts JSON from a model reply that may be wrapped in code fences or prose. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Model did not return valid JSON");
  }
}

export function newCallId(): string {
  return `call_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
