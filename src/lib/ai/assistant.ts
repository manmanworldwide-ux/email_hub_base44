import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, notFound } from "@/lib/api/errors";
import {
  resolveLlmForUser,
  textOfParts,
  toApiError,
  toolCallsOf,
  type LlmMessage,
  type LlmPart,
  type LlmTool,
  type LlmTurn,
} from "@/lib/ai/llm";
import { analyzeEmail } from "@/lib/ai/analyze";
import { listAccounts } from "@/lib/hub/accounts";
import { getEmail, listEmails, replyToEmail, sendEmail, updateEmailFlags } from "@/lib/hub/emails";
import { createEvent, listEvents } from "@/lib/hub/calendar";
import { getAnalyticsSummary } from "@/lib/hub/analytics";
import { parseAddressList } from "@/lib/providers/mime";
import { truncate } from "@/lib/utils";
import type { AssistantConversationRow, AssistantMessageRow } from "@/types";

const SYSTEM_PROMPT = `You are the AI assistant built into Email Hub, a unified inbox that connects several Gmail and Outlook mailboxes and calendars for one user.

You can search and read the user's emails, run AI analysis on them, send new emails, reply to emails, mark emails read/starred, list calendar events, and schedule meetings - across all connected accounts - using the provided tools.

How to work:
- Use tools to look things up instead of guessing. Never invent email content, senders, addresses or meeting details.
- Many users have several mailboxes. When an action needs an account (sending a new email, creating an event) and the right one is not obvious from context, call list_accounts and either pick the clearly matching one or ask the user which to use. Replies always go out from the mailbox that received the original email.
- Before sending an email or creating a calendar event, make sure you have every required detail (recipients, subject, body; title, start/end time, attendees). If the user's message already clearly authorises the action with those details, perform it directly and confirm what you did. Otherwise, show a short draft and ask for confirmation first.
- Keep answers concise and skimmable. When listing emails include sender, subject, date and mark unread ones. Reference emails by subject and sender, not by database id, unless the user asks for ids.
- Interpret relative dates ("tomorrow", "next Tuesday 3pm") using the current date/time provided and the user's timezone when given. Default meeting length is 30 minutes.
- If a tool returns an error, explain it plainly and suggest what the user can do (for example reconnecting an account).`;

const MAX_ITERATIONS = 12;
const HISTORY_LIMIT = 40;

const tools: LlmTool[] = [
  {
    name: "list_accounts",
    description: "Lists the user's connected mailboxes (Gmail/Outlook) with their ids, addresses and sync status.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_emails",
    description:
      "Searches the unified inbox. Returns compact email summaries (id, account, from, subject, date, snippet, read state, AI category/priority when analysed). Use for questions like 'what did X send me', 'any unread emails about Y', 'show today's emails'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Full-text search over subject, sender and body" },
        from: { type: "string", description: "Filter by sender address or domain fragment" },
        account_id: { type: "string", description: "Restrict to one connected account" },
        unread_only: { type: "boolean" },
        folder: { type: "string", enum: ["inbox", "sent", "archive", "drafts"] },
        category: { type: "string", description: "AI category filter, e.g. work, finance, meeting, newsletter" },
        priority: { type: "string", enum: ["urgent", "high", "normal", "low"] },
        requires_response: { type: "boolean", description: "Only emails the AI marked as needing a reply" },
        since: { type: "string", description: "ISO 8601 lower bound on received date" },
        until: { type: "string", description: "ISO 8601 upper bound on received date" },
        limit: { type: "integer", minimum: 1, maximum: 25, description: "Default 10" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_email",
    description: "Returns the full content of one email (headers, body text, AI analysis if present and the rest of its thread).",
    input_schema: {
      type: "object",
      properties: {
        email_id: { type: "string" },
        max_body_chars: { type: "integer", description: "Trim body to this many characters (default 6000)" },
      },
      required: ["email_id"],
      additionalProperties: false,
    },
  },
  {
    name: "analyze_email",
    description: "Runs (or returns the cached) AI analysis for an email: category, priority, sentiment, summary, action items, suggested reply.",
    input_schema: {
      type: "object",
      properties: { email_id: { type: "string" }, force: { type: "boolean", description: "Re-run even if cached" } },
      required: ["email_id"],
      additionalProperties: false,
    },
  },
  {
    name: "send_email",
    description: "Sends a new email from one of the connected accounts. Only call once the user has confirmed or clearly requested the send.",
    input_schema: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Connected account to send from" },
        to: { type: "array", items: { type: "string" }, description: "Recipient addresses, optionally 'Name <addr>'" },
        cc: { type: "array", items: { type: "string" } },
        bcc: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        body: { type: "string", description: "Plain-text body. Use blank lines between paragraphs." },
      },
      required: ["account_id", "to", "subject", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "reply_to_email",
    description: "Replies to an existing email from the mailbox that received it, keeping the thread. Only call once the user has confirmed or clearly requested the reply.",
    input_schema: {
      type: "object",
      properties: {
        email_id: { type: "string" },
        body: { type: "string", description: "Plain-text reply body" },
        reply_all: { type: "boolean", description: "Reply to all recipients (default false)" },
      },
      required: ["email_id", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "mark_email",
    description: "Marks an email as read/unread or starred/unstarred, syncing the change to the mailbox.",
    input_schema: {
      type: "object",
      properties: { email_id: { type: "string" }, is_read: { type: "boolean" }, is_starred: { type: "boolean" } },
      required: ["email_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_calendar_events",
    description: "Lists calendar events across connected accounts in a time range (defaults: now to +14 days).",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO 8601 start of range" },
        to: { type: "string", description: "ISO 8601 end of range" },
        account_id: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_calendar_event",
    description:
      "Schedules a meeting on one connected account's calendar and invites attendees. Creates a Google Meet / Teams link when online_meeting is true. Only call once the user has confirmed or clearly requested it.",
    input_schema: {
      type: "object",
      properties: {
        account_id: { type: "string" },
        title: { type: "string" },
        start: { type: "string", description: "ISO 8601 start, including timezone offset" },
        end: { type: "string", description: "ISO 8601 end, including timezone offset" },
        timezone: { type: "string", description: "IANA timezone for display, e.g. Europe/London" },
        attendees: { type: "array", items: { type: "string" }, description: "Attendee email addresses" },
        description: { type: "string" },
        location: { type: "string" },
        online_meeting: { type: "boolean", description: "Add a video meeting link (default true)" },
      },
      required: ["account_id", "title", "start", "end"],
      additionalProperties: false,
    },
  },
  {
    name: "get_inbox_summary",
    description: "Returns aggregate statistics: unread count, volume, AI category/priority breakdown, top senders, upcoming events.",
    input_schema: {
      type: "object",
      properties: { days: { type: "integer", minimum: 1, maximum: 90, description: "Period in days (default 7)" } },
      additionalProperties: false,
    },
  },
];

type ToolInput = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const toAddresses = (list: string[]) => list.flatMap((s) => parseAddressList(s));

async function executeTool(db: SupabaseClient, userId: string, name: string, input: ToolInput): Promise<unknown> {
  switch (name) {
    case "list_accounts": {
      const accounts = await listAccounts(db, userId);
      return accounts.map((a) => ({ id: a.id, provider: a.provider, email: a.email, display_name: a.display_name, status: a.status, last_synced_at: a.last_synced_at }));
    }
    case "search_emails": {
      const res = await listEmails(db, userId, {
        q: str(input.query),
        from: str(input.from),
        accountId: str(input.account_id),
        unread: bool(input.unread_only) ? true : undefined,
        folder: str(input.folder),
        category: str(input.category),
        priority: str(input.priority),
        requiresResponse: bool(input.requires_response),
        since: str(input.since),
        until: str(input.until),
        limit: Math.min(num(input.limit) ?? 10, 25),
        offset: 0,
      });
      return {
        total_matches: res.total,
        emails: res.items.map((e) => ({
          id: e.id,
          account: e.account?.email,
          from: e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email,
          subject: e.subject,
          received_at: e.received_at,
          is_read: e.is_read,
          is_starred: e.is_starred,
          folder: e.is_sent ? "sent" : e.folder,
          snippet: truncate(e.snippet, 200),
          category: e.analysis?.category ?? null,
          priority: e.analysis?.priority ?? null,
          requires_response: e.analysis?.requires_response ?? null,
        })),
      };
    }
    case "get_email": {
      const id = str(input.email_id);
      if (!id) throw new ApiError(400, "email_id is required");
      const email = await getEmail(db, userId, id);
      const max = num(input.max_body_chars) ?? 6000;
      const body = email.body_text ?? email.snippet ?? "";
      return {
        id: email.id,
        account: email.account?.email,
        from: email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email,
        to: email.to_recipients,
        cc: email.cc_recipients,
        subject: email.subject,
        received_at: email.received_at,
        is_read: email.is_read,
        has_attachments: email.has_attachments,
        body: body.length > max ? `${body.slice(0, max)}\n[... truncated ...]` : body,
        analysis: email.analysis
          ? {
              category: email.analysis.category,
              priority: email.analysis.priority,
              sentiment: email.analysis.sentiment,
              summary: email.analysis.summary,
              action_items: email.analysis.action_items,
              requires_response: email.analysis.requires_response,
              suggested_reply: email.analysis.suggested_reply,
            }
          : null,
        thread: email.thread
          .filter((t) => t.id !== email.id)
          .map((t) => ({ id: t.id, from: t.from_email, subject: t.subject, received_at: t.received_at, snippet: truncate(t.snippet, 160) })),
      };
    }
    case "analyze_email": {
      const id = str(input.email_id);
      if (!id) throw new ApiError(400, "email_id is required");
      const a = await analyzeEmail(db, userId, id, { force: bool(input.force) ?? false });
      return {
        category: a.category,
        priority: a.priority,
        sentiment: a.sentiment,
        intent: a.intent,
        summary: a.summary,
        action_items: a.action_items,
        entities: a.entities,
        requires_response: a.requires_response,
        suggested_reply: a.suggested_reply,
      };
    }
    case "send_email": {
      const accountId = str(input.account_id);
      const subject = str(input.subject);
      const body = str(input.body);
      if (!accountId || !subject || !body) throw new ApiError(400, "account_id, subject and body are required");
      return sendEmail(db, userId, {
        accountId,
        to: toAddresses(strList(input.to)),
        cc: toAddresses(strList(input.cc)),
        bcc: toAddresses(strList(input.bcc)),
        subject,
        bodyText: body,
      });
    }
    case "reply_to_email": {
      const id = str(input.email_id);
      const body = str(input.body);
      if (!id || !body) throw new ApiError(400, "email_id and body are required");
      return replyToEmail(db, userId, id, { bodyText: body, replyAll: bool(input.reply_all) ?? false });
    }
    case "mark_email": {
      const id = str(input.email_id);
      if (!id) throw new ApiError(400, "email_id is required");
      const updated = await updateEmailFlags(db, userId, id, { is_read: bool(input.is_read), is_starred: bool(input.is_starred) });
      return { id: updated.id, is_read: updated.is_read, is_starred: updated.is_starred };
    }
    case "list_calendar_events": {
      const events = await listEvents(db, userId, {
        from: str(input.from) ?? new Date().toISOString(),
        to: str(input.to) ?? new Date(Date.now() + 14 * 86_400_000).toISOString(),
        accountId: str(input.account_id),
        limit: Math.min(num(input.limit) ?? 50, 100),
      });
      return events.map((e) => ({
        id: e.id,
        account: e.account?.email,
        title: e.title,
        start_at: e.start_at,
        end_at: e.end_at,
        all_day: e.all_day,
        location: e.location,
        meeting_link: e.meeting_link,
        attendees: e.attendees.map((a) => a.email),
        organizer: e.organizer_email,
        status: e.status,
      }));
    }
    case "create_calendar_event": {
      const accountId = str(input.account_id);
      const title = str(input.title);
      const start = str(input.start);
      const end = str(input.end);
      if (!accountId || !title || !start || !end) throw new ApiError(400, "account_id, title, start and end are required");
      const event = await createEvent(db, userId, {
        accountId,
        title,
        start,
        end,
        timezone: str(input.timezone) ?? "UTC",
        attendees: toAddresses(strList(input.attendees)),
        description: str(input.description) ?? null,
        location: str(input.location) ?? null,
        onlineMeeting: bool(input.online_meeting) ?? true,
      });
      return {
        id: event.id,
        title: event.title,
        start_at: event.start_at,
        end_at: event.end_at,
        meeting_link: event.meeting_link,
        web_link: event.web_link,
        attendees: event.attendees.map((a) => a.email),
      };
    }
    case "get_inbox_summary": {
      const summary = await getAnalyticsSummary(db, userId, num(input.days) ?? 7);
      return {
        period_days: summary.period_days,
        totals: summary.totals,
        by_category: summary.by_category,
        by_priority: summary.by_priority,
        by_sentiment: summary.by_sentiment,
        top_senders: summary.top_senders.slice(0, 5),
        by_account: summary.by_account,
      };
    }
    default:
      throw new ApiError(400, `Unknown tool: ${name}`);
  }
}

export interface AssistantToolCall {
  name: string;
  input: unknown;
  ok: boolean;
  error?: string;
}

export interface AssistantResult {
  conversation_id: string;
  reply: string;
  tool_calls: AssistantToolCall[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  provider: string;
  model: string;
  source: "integration" | "platform";
}

/** Accepts the current LlmMessage shape plus legacy stored formats. */
function normalizeStoredMessage(row: AssistantMessageRow): LlmMessage | null {
  const c = row.content;
  if (typeof c === "string") return { role: row.role, parts: [{ type: "text", text: c }] };
  if (c && typeof c === "object" && !Array.isArray(c) && Array.isArray((c as LlmMessage).parts)) {
    return { ...(c as LlmMessage), role: row.role };
  }
  if (Array.isArray(c)) {
    const parts: LlmPart[] = [];
    for (const b of c as Record<string, unknown>[]) {
      if (b.type === "text" && typeof b.text === "string") parts.push({ type: "text", text: b.text });
      else if (b.type === "tool_use") parts.push({ type: "tool_call", id: String(b.id), name: String(b.name), input: (b.input as Record<string, unknown>) ?? {} });
      else if (b.type === "tool_result") {
        parts.push({
          type: "tool_result",
          tool_call_id: String(b.tool_use_id),
          name: "tool",
          content: typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? ""),
          is_error: Boolean(b.is_error),
        });
      }
    }
    return parts.length ? { role: row.role, parts } : null;
  }
  return null;
}

async function loadConversation(db: SupabaseClient, userId: string, conversationId: string | undefined, source: string) {
  if (conversationId) {
    const { data, error } = await db.from("assistant_conversations").select("*").eq("id", conversationId).eq("user_id", userId).maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!data) throw notFound("Conversation not found");
    return data as AssistantConversationRow;
  }
  const { data, error } = await db.from("assistant_conversations").insert({ user_id: userId, source }).select("*").single();
  if (error) throw new ApiError(500, error.message);
  return data as AssistantConversationRow;
}

async function loadHistory(db: SupabaseClient, conversationId: string): Promise<LlmMessage[]> {
  const { data, error } = await db
    .from("assistant_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new ApiError(500, error.message);
  const rows = ((data ?? []) as AssistantMessageRow[]).reverse();
  const messages = rows.map(normalizeStoredMessage).filter((m): m is LlmMessage => m !== null);

  // Must start with a plain user text message and must not end with unanswered tool calls.
  const start = messages.findIndex((m) => m.role === "user" && m.parts.some((p) => p.type === "text"));
  const trimmed = start >= 0 ? messages.slice(start) : [];
  while (trimmed.length && trimmed[trimmed.length - 1].role === "assistant" && toolCallsOf(trimmed[trimmed.length - 1].parts).length) {
    trimmed.pop();
  }
  return trimmed;
}

async function saveMessage(db: SupabaseClient, conversationId: string, userId: string, message: LlmMessage, displayText: string | null) {
  const { error } = await db
    .from("assistant_messages")
    .insert({ conversation_id: conversationId, user_id: userId, role: message.role, content: message, display_text: displayText });
  if (error) throw new ApiError(500, error.message);
}

export interface RunAssistantInput {
  message: string;
  conversationId?: string;
  source?: string;
  timezone?: string;
}

export async function runAssistant(db: SupabaseClient, userId: string, input: RunAssistantInput): Promise<AssistantResult> {
  const { client: llm, source } = await resolveLlmForUser(db, userId, "assistant");
  const conversation = await loadConversation(db, userId, input.conversationId, input.source ?? "ui");
  const history = await loadHistory(db, conversation.id);

  const userMessage: LlmMessage = { role: "user", parts: [{ type: "text", text: input.message }] };
  const messages: LlmMessage[] = [...history, userMessage];
  await saveMessage(db, conversation.id, userId, userMessage, input.message);

  const system = [
    SYSTEM_PROMPT,
    `Current date/time: ${new Date().toISOString()}${input.timezone ? `\nUser timezone: ${input.timezone}` : ""}`,
  ];

  const toolCalls: AssistantToolCall[] = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  let reply = "";
  let stopReason: string | null = null;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let turn: LlmTurn;
    try {
      turn = await llm.chat({ system, messages, tools, maxTokens: 8192, effort: "medium" });
    } catch (error) {
      return toApiError(error);
    }

    usage.input_tokens += turn.usage.input_tokens;
    usage.output_tokens += turn.usage.output_tokens;
    stopReason = turn.stop;
    messages.push(turn.message);
    const text = textOfParts(turn.message.parts);
    await saveMessage(db, conversation.id, userId, turn.message, text || null);

    if (turn.stop === "refusal") {
      reply = text || "I can't help with that request.";
      break;
    }
    if (turn.stop === "continue") continue;

    const calls = toolCallsOf(turn.message.parts);
    if (!calls.length) {
      reply = text;
      if (turn.stop === "max_tokens") reply += "\n\n(The response was cut short - ask me to continue.)";
      break;
    }

    const results: LlmPart[] = [];
    for (const call of calls) {
      try {
        const output = await executeTool(db, userId, call.name, call.input ?? {});
        results.push({ type: "tool_result", tool_call_id: call.id, name: call.name, content: JSON.stringify(output) });
        toolCalls.push({ name: call.name, input: call.input, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ type: "tool_result", tool_call_id: call.id, name: call.name, content: `Error: ${message}`, is_error: true });
        toolCalls.push({ name: call.name, input: call.input, ok: false, error: message });
      }
    }
    const resultMessage: LlmMessage = { role: "user", parts: results };
    messages.push(resultMessage);
    await saveMessage(db, conversation.id, userId, resultMessage, null);
  }

  if (!reply) reply = "I ran out of steps while working on that. Could you narrow the request or ask me to continue?";

  await db
    .from("assistant_conversations")
    .update({
      updated_at: new Date().toISOString(),
      provider: llm.provider,
      model: llm.model,
      ...(conversation.title ? {} : { title: truncate(input.message.replace(/\s+/g, " "), 80) }),
    })
    .eq("id", conversation.id);

  return { conversation_id: conversation.id, reply, tool_calls: toolCalls, stop_reason: stopReason, usage, provider: llm.provider, model: llm.model, source };
}

export async function listConversations(db: SupabaseClient, userId: string, limit = 30) {
  const { data, error } = await db
    .from("assistant_conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new ApiError(500, error.message);
  return (data ?? []) as AssistantConversationRow[];
}

export async function getConversationMessages(db: SupabaseClient, userId: string, conversationId: string) {
  const conversation = await loadConversation(db, userId, conversationId, "ui");
  const { data, error } = await db
    .from("assistant_messages")
    .select("id, role, display_text, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new ApiError(500, error.message);
  const messages = ((data ?? []) as Pick<AssistantMessageRow, "id" | "role" | "display_text" | "created_at">[]).filter((m) => m.display_text);
  return { conversation, messages };
}
