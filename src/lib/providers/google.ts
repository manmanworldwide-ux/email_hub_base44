import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { htmlToText, textToHtml } from "@/lib/utils";
import type {
  Address,
  CreateEventParams,
  EmailRow,
  EventAttendee,
  ListMessagesPage,
  NormalizedEmail,
  NormalizedEvent,
  ProviderProfile,
  SendMailParams,
  TokenSet,
} from "@/types";
import { base64UrlDecode, base64UrlEncode, buildRfc822, parseAddressList, replySubject } from "./mime";
import { requireOAuthCredentials } from "./credentials";
import {
  expiresAtFrom,
  formEncode,
  mapWithConcurrency,
  providerFetch,
  toIso,
  type MailProvider,
  type ReplyParams,
  type SendResult,
} from "./types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR = "https://www.googleapis.com/calendar/v3/calendars/primary";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
];

const redirectUri = () => `${env.appUrl}/api/auth/google/callback`;

interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  organizer?: { email?: string; displayName?: string };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}

function toTokenSet(t: GoogleTokenResponse, previousRefresh: string | null = null): TokenSet {
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? previousRefresh,
    expires_at: expiresAtFrom(t.expires_in),
    scope: t.scope ? t.scope.split(" ") : [],
  };
}

function walkParts(part: GmailPart | undefined, acc: { text: string | null; html: string | null; attachments: boolean }) {
  if (!part) return;
  if (part.filename && part.body?.attachmentId) acc.attachments = true;
  if (part.parts?.length) {
    for (const p of part.parts) walkParts(p, acc);
    return;
  }
  const data = part.body?.data;
  if (!data) return;
  const mime = (part.mimeType ?? "").toLowerCase();
  if (mime === "text/plain" && acc.text === null) acc.text = base64UrlDecode(data);
  else if (mime === "text/html" && acc.html === null) acc.html = base64UrlDecode(data);
}

function folderFromLabels(labels: string[]): string {
  if (labels.includes("DRAFT")) return "drafts";
  if (labels.includes("SENT")) return "sent";
  if (labels.includes("TRASH")) return "trash";
  if (labels.includes("SPAM")) return "spam";
  if (labels.includes("INBOX")) return "inbox";
  return "archive";
}

export function normalizeGmailMessage(msg: GmailMessage): NormalizedEmail {
  const headers = new Map<string, string>();
  for (const h of msg.payload?.headers ?? []) headers.set(h.name.toLowerCase(), h.value);

  const acc = { text: null as string | null, html: null as string | null, attachments: false };
  walkParts(msg.payload, acc);
  if (!acc.text && acc.html) acc.text = htmlToText(acc.html);

  const labels = msg.labelIds ?? [];
  const from = parseAddressList(headers.get("from"))[0];
  const replyTo = parseAddressList(headers.get("reply-to"))[0];
  const received = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString();

  return {
    provider_message_id: msg.id,
    thread_id: msg.threadId,
    internet_message_id: headers.get("message-id") ?? null,
    in_reply_to: headers.get("in-reply-to") ?? null,
    references_header: headers.get("references") ?? null,
    subject: headers.get("subject") ?? "(no subject)",
    from_name: from?.name ?? null,
    from_email: from?.email ?? null,
    to_recipients: parseAddressList(headers.get("to")),
    cc_recipients: parseAddressList(headers.get("cc")),
    bcc_recipients: parseAddressList(headers.get("bcc")),
    reply_to: replyTo?.email ?? null,
    snippet: msg.snippet ?? "",
    body_text: acc.text,
    body_html: acc.html,
    received_at: received,
    sent_at: toIso(headers.get("date")),
    is_read: !labels.includes("UNREAD"),
    is_starred: labels.includes("STARRED"),
    is_draft: labels.includes("DRAFT"),
    is_sent: labels.includes("SENT"),
    has_attachments: acc.attachments,
    labels,
    folder: folderFromLabels(labels),
    importance: labels.includes("IMPORTANT") ? "high" : "normal",
    web_link: `https://mail.google.com/mail/u/0/#all/${msg.threadId}`,
  };
}

function normalizeEvent(e: GoogleEvent): NormalizedEvent {
  const allDay = Boolean(e.start?.date && !e.start?.dateTime);
  const start = allDay ? `${e.start?.date}T00:00:00.000Z` : toIso(e.start?.dateTime) ?? new Date().toISOString();
  const end = allDay ? `${e.end?.date}T00:00:00.000Z` : toIso(e.end?.dateTime) ?? start;
  const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
  const attendees: EventAttendee[] = (e.attendees ?? []).map((a) => ({
    email: a.email.toLowerCase(),
    name: a.displayName ?? null,
    response: a.responseStatus ?? null,
  }));
  return {
    provider_event_id: e.id,
    calendar_id: "primary",
    title: e.summary ?? null,
    description: e.description ?? null,
    location: e.location ?? null,
    start_at: start,
    end_at: end,
    timezone: e.start?.timeZone ?? null,
    all_day: allDay,
    attendees,
    organizer_email: e.organizer?.email?.toLowerCase() ?? null,
    organizer_name: e.organizer?.displayName ?? null,
    status: e.status ?? null,
    meeting_link: e.hangoutLink ?? video ?? null,
    web_link: e.htmlLink ?? null,
  };
}

export const googleProvider: MailProvider = {
  id: "google",
  label: "Gmail",

  async getAuthUrl(state) {
    const creds = await requireOAuthCredentials("google");
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode(code) {
    const creds = await requireOAuthCredentials("google");
    const data = await providerFetch<GoogleTokenResponse>("google", TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formEncode({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    return toTokenSet(data);
  },

  async refreshAccessToken(refreshToken) {
    const creds = await requireOAuthCredentials("google");
    const data = await providerFetch<GoogleTokenResponse>("google", TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formEncode({
        refresh_token: refreshToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: "refresh_token",
      }),
    });
    return toTokenSet(data, refreshToken);
  },

  async getProfile(accessToken) {
    const info = await providerFetch<{ sub: string; email: string; name?: string; picture?: string }>(
      "google",
      USERINFO_URL,
      { accessToken },
    );
    return { id: info.sub, email: info.email.toLowerCase(), name: info.name ?? null, avatar_url: info.picture ?? null };
  },

  async listMessages(accessToken, { since, pageToken, maxResults }) {
    const params = new URLSearchParams({
      maxResults: String(Math.min(maxResults, 100)),
      q: `after:${Math.floor(since.getTime() / 1000)}`,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const list = await providerFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(
      "google",
      `${GMAIL}/messages?${params.toString()}`,
      { accessToken },
    );
    const ids = (list.messages ?? []).map((m) => m.id);
    const full = await mapWithConcurrency(ids, 8, (id) =>
      providerFetch<GmailMessage>("google", `${GMAIL}/messages/${id}?format=full`, { accessToken }),
    );
    return {
      messages: full.map(normalizeGmailMessage),
      nextPageToken: list.nextPageToken ?? null,
    } satisfies ListMessagesPage;
  },

  async sendMail(accessToken, params) {
    const raw = base64UrlEncode(buildRfc822(params));
    const body: Record<string, string> = { raw };
    if (params.threadId) body.threadId = params.threadId;
    const sent = await providerFetch<{ id: string; threadId: string }>("google", `${GMAIL}/messages/send`, {
      method: "POST",
      accessToken,
      body: JSON.stringify(body),
    });
    return { providerMessageId: sent.id, threadId: sent.threadId } satisfies SendResult;
  },

  async replyToMessage(accessToken, original, params) {
    const self = params.fromEmail.toLowerCase();
    const primary: Address[] = original.reply_to
      ? [{ name: null, email: original.reply_to }]
      : original.from_email
        ? [{ name: original.from_name, email: original.from_email }]
        : [];
    const to = primary.filter((a) => a.email !== self);
    const cc: Address[] = params.replyAll
      ? [...original.to_recipients, ...original.cc_recipients].filter(
          (a) => a.email !== self && !to.some((t) => t.email === a.email),
        )
      : [];
    const references = [original.references_header, original.internet_message_id].filter(Boolean).join(" ") || null;
    return this.sendMail(accessToken, {
      fromName: params.fromName,
      fromEmail: params.fromEmail,
      to: to.length ? to : primary,
      cc,
      bcc: [],
      subject: replySubject(original.subject),
      text: params.text,
      html: params.html ?? (params.text ? textToHtml(params.text) : null),
      inReplyTo: original.internet_message_id,
      references,
      threadId: original.thread_id,
    });
  },

  async setRead(accessToken, id, read) {
    await providerFetch("google", `${GMAIL}/messages/${id}/modify`, {
      method: "POST",
      accessToken,
      body: JSON.stringify(read ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] }),
    });
  },

  async setStarred(accessToken, id, starred) {
    await providerFetch("google", `${GMAIL}/messages/${id}/modify`, {
      method: "POST",
      accessToken,
      body: JSON.stringify(starred ? { addLabelIds: ["STARRED"] } : { removeLabelIds: ["STARRED"] }),
    });
  },

  async listEvents(accessToken, { timeMin, timeMax }) {
    const events: NormalizedEvent[] = [];
    let pageToken: string | null = null;
    for (let page = 0; page < 4; page++) {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const data: { items?: GoogleEvent[]; nextPageToken?: string } = await providerFetch(
        "google",
        `${CALENDAR}/events?${params.toString()}`,
        { accessToken },
      );
      events.push(...(data.items ?? []).map(normalizeEvent));
      pageToken = data.nextPageToken ?? null;
      if (!pageToken) break;
    }
    return events;
  },

  async createEvent(accessToken, params) {
    const body: Record<string, unknown> = {
      summary: params.title,
      description: params.description ?? undefined,
      location: params.location ?? undefined,
      attendees: params.attendees.map((a) => ({ email: a.email, displayName: a.name ?? undefined })),
      start: params.allDay
        ? { date: params.start.slice(0, 10) }
        : { dateTime: params.start, timeZone: params.timezone },
      end: params.allDay ? { date: params.end.slice(0, 10) } : { dateTime: params.end, timeZone: params.timezone },
    };
    if (params.onlineMeeting) {
      body.conferenceData = {
        createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
      };
    }
    const created = await providerFetch<GoogleEvent>(
      "google",
      `${CALENDAR}/events?sendUpdates=all&conferenceDataVersion=1`,
      { method: "POST", accessToken, body: JSON.stringify(body) },
    );
    return normalizeEvent(created);
  },

  async deleteEvent(accessToken, providerEventId) {
    await providerFetch("google", `${CALENDAR}/events/${encodeURIComponent(providerEventId)}?sendUpdates=all`, {
      method: "DELETE",
      accessToken,
    });
  },
};
