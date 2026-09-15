import { ENDPOINTS, type EndpointDoc } from "@/lib/api/endpoints";

type JsonObject = Record<string, unknown>;

function describeBody(body: JsonObject | undefined): string | null {
  if (!body) return null;
  const props = (body.properties ?? {}) as Record<string, JsonObject>;
  const required = new Set((body.required as string[] | undefined) ?? []);
  const parts = Object.entries(props).map(([key, schema]) => {
    const type = Array.isArray(schema.enum)
      ? (schema.enum as unknown[]).join("|")
      : schema.type === "array"
        ? `[${((schema.items as JsonObject | undefined)?.type as string) ?? "string"}]`
        : ((schema.format as string) ?? (schema.type as string) ?? "any");
    return `${key}${required.has(key) ? "*" : ""}: ${type}`;
  });
  return parts.length ? `{ ${parts.join(", ")} }` : null;
}

function renderEndpoint(e: EndpointDoc): string[] {
  const lines = [`- ${e.method} ${e.path} — ${e.summary}${e.description ? `. ${e.description}` : ""}`];
  if (e.query) lines.push(`    query: ${Object.entries(e.query).map(([k, v]) => `${k} (${v})`).join("; ")}`);
  const body = describeBody(e.body as JsonObject | undefined);
  if (body) lines.push(`    body: ${body}   (* = required)`);
  if (e.example) lines.push(`    example: ${JSON.stringify(e.example)}`);
  return lines;
}

/**
 * Plain-text guide an AI agent can fetch by URL instead of pasting documentation into a prompt.
 * Generated from the endpoint catalogue so it always matches the deployed API.
 */
export function buildAgentGuide(baseUrl: string): string {
  const visible = ENDPOINTS.filter((e) => e.scope !== "admin" && e.scope !== "interactive");
  const groups = new Map<string, EndpointDoc[]>();
  for (const e of visible) groups.set(e.tag, [...(groups.get(e.tag) ?? []), e]);

  const out: string[] = [
    "# Email Hub API — guide for AI agents",
    "",
    "Email Hub is one user's unified Gmail + Outlook inbox with calendars and AI analysis. Through this REST API you can",
    "monitor mailboxes, search and read email, run AI analysis, and — when the token allows it — reply, send and schedule meetings.",
    "",
    `Base URL: ${baseUrl}`,
    "Authentication: send the header  Authorization: Bearer <ACCESS_TOKEN>  on every request (tokens start with ehk_). The header x-api-key also works.",
    'Responses: JSON  {"ok":true,"data":...,"meta":{...}}  or  {"ok":false,"error":{"code":"...","message":"..."}}.',
    "Timestamps are ISO 8601 (UTC). Ids are UUIDs. Lists are newest first; paginate with limit/offset and read meta.total for counts.",
    `OpenAPI 3.1 spec (machine-readable): ${baseUrl}/api/v1/openapi.json`,
    "",
    "## Rules",
    "1. Always call the API for current data when asked about accounts, emails or events. Never answer from an earlier result.",
    "2. When listing mailboxes, enumerate every item in data by email address (several can share a display_name) and state meta.total.",
    "3. Never send email, reply, or create/cancel calendar events unless the user explicitly asked for that action. Show a draft first when in doubt.",
    '4. For "today" / "tomorrow" / "this week" compute from and to in the user\'s timezone and pass ISO timestamps with offsets.',
    "5. Count emails with meta.total; count events with the length of data.",
    "6. If ok is false, tell the user error.message. Code needs_reauth means the mailbox must be reconnected in Email Hub; provider_not_configured means an administrator must set up Gmail/Outlook; ai_not_configured means the user must add an AI provider under Settings → AI provider.",
    "7. Long operations (sync, batch analysis, assistant) can take up to 60 seconds.",
    "",
    "## Endpoints",
  ];

  for (const [tag, list] of groups) {
    out.push("", `### ${tag}`);
    for (const e of list) out.push(...renderEndpoint(e));
  }

  out.push(
    "",
    "## Data shapes",
    "- Email list item: id, account_id, account{email,provider}, thread_id, subject, from_name, from_email, to_recipients[{name,email}], snippet, received_at, is_read, is_starred, is_sent, has_attachments, folder, analysis{category,priority,sentiment,summary,requires_response} (analysis is null until analysed).",
    "- Email detail adds: body_text, body_html, cc_recipients, labels, importance, web_link, analysis (full: intent, action_items[{text,due}], entities{people,organizations,dates,amounts}, suggested_reply, language), thread[] (other messages in the conversation).",
    "- Calendar event: id, account{email,provider}, title, description, location, start_at, end_at, all_day, attendees[{email,name,response}], organizer_email, status, meeting_link, web_link. Upcoming events add minutes_until_start and in_progress.",
    "- Account: id, provider (google|microsoft), email, display_name, status (active|needs_reauth|error|disabled), last_synced_at, last_calendar_synced_at.",
    "- Analysis categories: work, personal, finance, meeting, sales, support, newsletter, promotion, notification, social, spam, other. Priorities: urgent, high, normal, low.",
    "",
    "## Common tasks",
    `- What needs attention now: GET ${baseUrl}/api/v1/emails?unread=true&limit=25 and GET ${baseUrl}/api/v1/emails?requires_response=true&unread=true`,
    `- Today's meetings: GET ${baseUrl}/api/v1/calendar/events?from=<today 00:00 with offset>&to=<today 23:59 with offset>`,
    `- Reminders 30 minutes before: every 5 minutes GET ${baseUrl}/api/v1/calendar/upcoming?within_minutes=30&refresh=true&include_in_progress=false and notify once per event id.`,
    `- Keep data fresh: POST ${baseUrl}/api/v1/sync every 15–30 minutes (the hub's own schedule runs once a day).`,
    `- Anything conversational: POST ${baseUrl}/api/v1/ai/assistant {"message":"...","timezone":"<IANA tz>","conversation_id":"<optional>"} — the hub's built-in assistant can search, summarise, draft, reply and schedule using the user's own AI provider.`,
    "",
    `This guide is generated from the live API. Re-read it at ${baseUrl}/api/v1/agent-guide when in doubt.`,
  );

  return out.join("\n");
}
