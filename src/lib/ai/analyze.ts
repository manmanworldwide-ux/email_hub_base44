import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { ApiError } from "@/lib/api/errors";
import { htmlToText } from "@/lib/utils";
import { getEmailRow } from "@/lib/hub/emails";
import { resolveLlmForUser, toApiError, type JsonSchema, type LlmClient } from "@/lib/ai/llm";
import type { EmailAnalysisRow, EmailRow } from "@/types";

export const EMAIL_CATEGORIES = [
  "work",
  "personal",
  "finance",
  "meeting",
  "sales",
  "support",
  "newsletter",
  "promotion",
  "notification",
  "social",
  "spam",
  "other",
] as const;

export const EmailAnalysisSchema = z.object({
  category: z.enum(EMAIL_CATEGORIES).describe("Best single category for the email"),
  priority: z.enum(["urgent", "high", "normal", "low"]).describe("How quickly the recipient should act"),
  sentiment: z.enum(["positive", "neutral", "negative"]).describe("Overall tone of the sender"),
  intent: z.string().describe('Short phrase describing what the sender wants, e.g. "requesting a meeting"'),
  summary: z.string().describe("Two to three sentence summary written for the recipient"),
  action_items: z
    .array(
      z.object({
        text: z.string().describe("The concrete action the recipient should take"),
        due: z.string().describe("ISO 8601 date if a deadline is stated or implied, otherwise an empty string"),
      }),
    )
    .describe("Actions the recipient needs to take; empty if none"),
  entities: z.object({
    people: z.array(z.string()),
    organizations: z.array(z.string()),
    dates: z.array(z.string()).describe("Dates/times mentioned, as written"),
    amounts: z.array(z.string()).describe("Monetary amounts or quantities mentioned"),
  }),
  requires_response: z.boolean().describe("True if the sender expects a reply from the recipient"),
  suggested_reply: z
    .string()
    .describe("A short, professional draft reply in the email's language if a response is needed, otherwise an empty string"),
  language: z.string().describe("ISO 639-1 language code of the email body"),
});

export type EmailAnalysis = z.infer<typeof EmailAnalysisSchema>;

const SYSTEM_PROMPT = `You are the triage analyst inside Email Hub, a unified inbox that aggregates several Gmail and Outlook mailboxes for one user.
You receive one email (headers + body) and produce a structured analysis that powers inbox prioritisation, dashboards and an AI assistant.

Guidelines:
- Judge priority from the recipient's perspective: "urgent" means action is needed today or a hard deadline is imminent; "high" means action within a few days; "normal" is routine correspondence; "low" is informational, promotional or automated.
- Automated newsletters, marketing and system notifications are almost never "requires_response".
- Extract action items only when the email explicitly or clearly implicitly asks the recipient to do something.
- The summary must be faithful to the content. Never invent facts, names, dates or amounts that are not in the email.
- If the email body is empty or unreadable, categorise as best you can from the subject and sender and keep the summary short.
- Draft replies should be concise, polite and ready to send after light editing.`;

const MAX_BODY_CHARS = 24_000;

/** JSON Schema for structured output: strict objects, every property required. */
function strictify(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictify);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === "$schema" || key === "$id") continue;
    out[key] = key === "properties" && value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, strictify(v)]))
      : strictify(value);
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as Record<string, unknown>);
  }
  return out;
}

let cachedSchema: JsonSchema | null = null;
export function analysisJsonSchema(): JsonSchema {
  if (!cachedSchema) cachedSchema = strictify(z.toJSONSchema(EmailAnalysisSchema)) as JsonSchema;
  return cachedSchema;
}

function emailToPrompt(email: EmailRow): string {
  const rawBody = email.body_text ?? (email.body_html ? htmlToText(email.body_html) : email.snippet ?? "");
  const truncated = rawBody.length > MAX_BODY_CHARS;
  const body = truncated ? `${rawBody.slice(0, MAX_BODY_CHARS)}\n\n[... body truncated after ${MAX_BODY_CHARS} characters ...]` : rawBody;
  const list = (a: { name: string | null; email: string }[]) => a.map((x) => (x.name ? `${x.name} <${x.email}>` : x.email)).join(", ");
  return [
    `From: ${email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email ?? "unknown"}`,
    `To: ${list(email.to_recipients ?? [])}`,
    email.cc_recipients?.length ? `Cc: ${list(email.cc_recipients)}` : null,
    `Date: ${email.received_at ?? ""}`,
    `Subject: ${email.subject ?? "(no subject)"}`,
    `Has attachments: ${email.has_attachments ? "yes" : "no"}`,
    "",
    body,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export async function runEmailAnalysis(email: EmailRow, llm: LlmClient) {
  try {
    const result = await llm.generateJson({
      system: SYSTEM_PROMPT,
      user: emailToPrompt(email),
      schema: analysisJsonSchema(),
      schemaName: "email_analysis",
      maxTokens: 4096,
    });
    const parsed = EmailAnalysisSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new ApiError(502, `The model returned an invalid analysis: ${parsed.error.message.slice(0, 300)}`, "ai_parse_error");
    }
    return { analysis: parsed.data, model: result.model, provider: llm.provider, usage: result.usage };
  } catch (error) {
    return toApiError(error);
  }
}

export async function getExistingAnalysis(db: SupabaseClient, emailId: string): Promise<EmailAnalysisRow | null> {
  const { data, error } = await db.from("email_analyses").select("*").eq("email_id", emailId).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  return (data as EmailAnalysisRow | null) ?? null;
}

export async function analyzeEmail(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  options: { force?: boolean; llm?: LlmClient } = {},
): Promise<EmailAnalysisRow> {
  const email = await getEmailRow(db, userId, emailId);
  if (!options.force) {
    const existing = await getExistingAnalysis(db, emailId);
    if (existing) return existing;
  }
  const llm = options.llm ?? (await resolveLlmForUser(db, userId, "analysis")).client;
  const { analysis, model, provider, usage } = await runEmailAnalysis(email, llm);
  const { data, error } = await db
    .from("email_analyses")
    .upsert(
      {
        email_id: email.id,
        user_id: userId,
        category: analysis.category,
        priority: analysis.priority,
        sentiment: analysis.sentiment,
        intent: analysis.intent,
        summary: analysis.summary,
        action_items: analysis.action_items,
        entities: analysis.entities,
        requires_response: analysis.requires_response,
        suggested_reply: analysis.suggested_reply || null,
        language: analysis.language,
        model,
        provider,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
      },
      { onConflict: "email_id" },
    )
    .select("*")
    .single();
  if (error) throw new ApiError(500, `Failed to store analysis: ${error.message}`);
  return data as EmailAnalysisRow;
}

export interface BatchAnalyzeResult {
  analyzed: number;
  failed: number;
  results: { email_id: string; ok: boolean; error?: string; category?: string | null; priority?: string | null }[];
}

/** Analyses received emails that do not yet have an analysis, newest first. */
export async function analyzeUnanalyzedEmails(
  db: SupabaseClient,
  userId: string,
  options: { limit?: number; accountId?: string } = {},
): Promise<BatchAnalyzeResult> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  let query = db
    .from("emails")
    .select("id, email_analyses!left(id)")
    .eq("user_id", userId)
    .eq("is_sent", false)
    .eq("is_draft", false)
    .is("email_analyses", null)
    .order("received_at", { ascending: false })
    .limit(limit);
  if (options.accountId) query = query.eq("account_id", options.accountId);
  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);

  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  return analyzeEmailIds(db, userId, ids);
}

export async function analyzeEmailIds(db: SupabaseClient, userId: string, ids: string[]): Promise<BatchAnalyzeResult> {
  const result: BatchAnalyzeResult = { analyzed: 0, failed: 0, results: [] };
  if (!ids.length) return result;
  const llm = (await resolveLlmForUser(db, userId, "analysis")).client;
  const concurrency = 3;
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
      while (index < ids.length) {
        const id = ids[index++];
        try {
          const a = await analyzeEmail(db, userId, id, { force: true, llm });
          result.analyzed += 1;
          result.results.push({ email_id: id, ok: true, category: a.category, priority: a.priority });
        } catch (error) {
          result.failed += 1;
          result.results.push({ email_id: id, ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }),
  );
  return result;
}
