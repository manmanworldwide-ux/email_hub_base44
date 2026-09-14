import { env } from "@/lib/env";
import { htmlToText, textToHtml } from "@/lib/utils";
import type {
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
import {
  expiresAtFrom,
  formEncode,
  providerFetch,
  ProviderHttpError,
  toIso,
  type MailProvider,
  type ReplyParams,
  type SendResult,
} from "./types";
import { requireOAuthCredentials } from "./credentials";

const GRAPH = "https://graph.microsoft.com/v1.0";

export const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
];

const MESSAGE_SELECT = [
  "id",
  "conversationId",
  "internetMessageId",
  "subject",
  "bodyPreview",
  "body",
  "from",
  "toRecipients",
  "ccRecipients",
  "bccRecipients",
  "replyTo",
  "receivedDateTime",
  "sentDateTime",
  "isRead",
  "isDraft",
  "hasAttachments",
  "importance",
  "flag",
  "parentFolderId",
  "categories",
  "webLink",
].join(",");

const EVENT_SELECT = [
  "id",
  "subject",
  "bodyPreview",
  "body",
  "location",
  "start",
  "end",
  "isAllDay",
  "attendees",
  "organizer",
  "isCancelled",
  "showAs",
  "isOnlineMeeting",
  "onlineMeeting",
  "onlineMeetingUrl",
  "webLink",
].join(",");

const MAIL_HEADERS = { Prefer: 'outlook.body-content-type="html", IdType="ImmutableId"' };
const CAL_HEADERS = { Prefer: 'outlook.timezone="UTC"' };

const authority = (tenant: string) => `https://login.microsoftonline.com/${tenant || "common"}/oauth2/v2.0`;
const redirectUri = () => `${env.appUrl}/api/auth/microsoft/callback`;

interface MsTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

interface GraphRecipient {
  emailAddress?: { name?: string; address?: string };
}

interface GraphMessage {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  replyTo?: GraphRecipient[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  isDraft?: boolean;
  hasAttachments?: boolean;
  importance?: string;
  flag?: { flagStatus?: string };
  parentFolderId?: string;
  categories?: string[];
  webLink?: string;
}

interface GraphEvent {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  location?: { displayName?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  isAllDay?: boolean;
  attendees?: { emailAddress?: { name?: string; address?: string }; status?: { response?: string } }[];
  organizer?: { emailAddress?: { name?: string; address?: string } };
  isCancelled?: boolean;
  showAs?: string;
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string };
  onlineMeetingUrl?: string;
  webLink?: string;
}

interface GraphPage<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

const folderCache = new Map<string, { map: Map<string, string>; fetchedAt: number }>();

const WELL_KNOWN_FOLDERS: Record<string, string> = {
  inbox: "inbox",
  "sent items": "sent",
  drafts: "drafts",
  "deleted items": "trash",
  "junk email": "spam",
  archive: "archive",
};

async function folderMap(accessToken: string): Promise<Map<string, string>> {
  const cached = folderCache.get(accessToken);
  if (cached && Date.now() - cached.fetchedAt < 10 * 60_000) return cached.map;
  const data = await providerFetch<GraphPage<{ id: string; displayName: string }>>(
    "microsoft",
    `${GRAPH}/me/mailFolders?$top=100&$select=id,displayName`,
    { accessToken, headers: MAIL_HEADERS },
  );
  const map = new Map<string, string>();
  for (const f of data.value) {
    const key = f.displayName.toLowerCase();
    map.set(f.id, WELL_KNOWN_FOLDERS[key] ?? key);
  }
  folderCache.set(accessToken, { map, fetchedAt: Date.now() });
  return map;
}

function recipients(list: GraphRecipient[] | undefined) {
  return (list ?? [])
    .filter((r) => r.emailAddress?.address)
    .map((r) => ({ name: r.emailAddress?.name || null, email: r.emailAddress!.address!.toLowerCase() }));
}

function toTokenSet(t: MsTokenResponse, previousRefresh: string | null = null): TokenSet {
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? previousRefresh,
    expires_at: expiresAtFrom(t.expires_in),
    scope: t.scope ? t.scope.split(" ") : [],
  };
}

export function normalizeGraphMessage(m: GraphMessage, folders: Map<string, string>): NormalizedEmail {
  const folder = (m.parentFolderId && folders.get(m.parentFolderId)) || "inbox";
  const isHtml = (m.body?.contentType ?? "").toLowerCase() === "html";
  const html = isHtml ? m.body?.content ?? null : null;
  const text = isHtml ? (html ? htmlToText(html) : null) : m.body?.content ?? null;
  const from = recipients(m.from ? [m.from] : [])[0];
  const replyTo = recipients(m.replyTo)[0];
  return {
    provider_message_id: m.id,
    thread_id: m.conversationId ?? null,
    internet_message_id: m.internetMessageId ?? null,
    in_reply_to: null,
    references_header: null,
    subject: m.subject ?? "(no subject)",
    from_name: from?.name ?? null,
    from_email: from?.email ?? null,
    to_recipients: recipients(m.toRecipients),
    cc_recipients: recipients(m.ccRecipients),
    bcc_recipients: recipients(m.bccRecipients),
    reply_to: replyTo?.email ?? null,
    snippet: m.bodyPreview ?? "",
    body_text: text,
    body_html: html,
    received_at: toIso(m.receivedDateTime) ?? new Date().toISOString(),
    sent_at: toIso(m.sentDateTime),
    is_read: Boolean(m.isRead),
    is_starred: m.flag?.flagStatus === "flagged",
    is_draft: Boolean(m.isDraft),
    is_sent: folder === "sent",
    has_attachments: Boolean(m.hasAttachments),
    labels: m.categories ?? [],
    folder,
    importance: m.importance ?? "normal",
    web_link: m.webLink ?? null,
  };
}

function normalizeEvent(e: GraphEvent): NormalizedEvent {
  const start = toIso(e.start?.dateTime, true) ?? new Date().toISOString();
  const end = toIso(e.end?.dateTime, true) ?? start;
  const attendees: EventAttendee[] = (e.attendees ?? [])
    .filter((a) => a.emailAddress?.address)
    .map((a) => ({
      email: a.emailAddress!.address!.toLowerCase(),
      name: a.emailAddress?.name ?? null,
      response: a.status?.response ?? null,
    }));
  return {
    provider_event_id: e.id,
    calendar_id: "primary",
    title: e.subject ?? null,
    description: e.bodyPreview ?? (e.body?.content ? htmlToText(e.body.content) : null),
    location: e.location?.displayName || null,
    start_at: start,
    end_at: end,
    timezone: e.start?.timeZone ?? null,
    all_day: Boolean(e.isAllDay),
    attendees,
    organizer_email: e.organizer?.emailAddress?.address?.toLowerCase() ?? null,
    organizer_name: e.organizer?.emailAddress?.name ?? null,
    status: e.isCancelled ? "cancelled" : e.showAs ?? "confirmed",
    meeting_link: e.onlineMeeting?.joinUrl ?? e.onlineMeetingUrl ?? null,
    web_link: e.webLink ?? null,
  };
}

function graphRecipients(list: { name: string | null; email: string }[]) {
  return list.map((a) => ({ emailAddress: { address: a.email, name: a.name ?? undefined } }));
}

function utcWallClock(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "");
}

export const microsoftProvider: MailProvider = {
  id: "microsoft",
  label: "Outlook",

  async getAuthUrl(state) {
    const creds = await requireOAuthCredentials("microsoft");
    const params = new URLSearchParams({
      client_id: creds.clientId,
      response_type: "code",
      redirect_uri: redirectUri(),
      response_mode: "query",
      scope: MICROSOFT_SCOPES.join(" "),
      state,
      prompt: "select_account",
    });
    return `${authority(creds.tenant)}/authorize?${params.toString()}`;
  },

  async exchangeCode(code) {
    const creds = await requireOAuthCredentials("microsoft");
    const data = await providerFetch<MsTokenResponse>("microsoft", `${authority(creds.tenant)}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formEncode({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        code,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        scope: MICROSOFT_SCOPES.join(" "),
      }),
    });
    return toTokenSet(data);
  },

  async refreshAccessToken(refreshToken) {
    const creds = await requireOAuthCredentials("microsoft");
    const data = await providerFetch<MsTokenResponse>("microsoft", `${authority(creds.tenant)}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formEncode({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: MICROSOFT_SCOPES.join(" "),
      }),
    });
    return toTokenSet(data, refreshToken);
  },

  async getProfile(accessToken) {
    const me = await providerFetch<{ id: string; displayName?: string; mail?: string; userPrincipalName?: string }>(
      "microsoft",
      `${GRAPH}/me`,
      { accessToken },
    );
    const email = (me.mail ?? me.userPrincipalName ?? "").toLowerCase();
    if (!email) throw new ProviderHttpError("microsoft", 400, "Microsoft account has no email address");
    return { id: me.id, email, name: me.displayName ?? null, avatar_url: null } satisfies ProviderProfile;
  },

  async listMessages(accessToken, { since, pageToken, maxResults }) {
    const url =
      pageToken ??
      `${GRAPH}/me/messages?$top=${Math.min(maxResults, 50)}&$orderby=receivedDateTime desc&$filter=${encodeURIComponent(
        `receivedDateTime ge ${since.toISOString()}`,
      )}&$select=${MESSAGE_SELECT}`;
    const [page, folders] = await Promise.all([
      providerFetch<GraphPage<GraphMessage>>("microsoft", url, { accessToken, headers: MAIL_HEADERS }),
      folderMap(accessToken),
    ]);
    const messages = page.value
      .map((m) => normalizeGraphMessage(m, folders))
      .filter((m) => m.folder !== "trash" && m.folder !== "spam");
    return { messages, nextPageToken: page["@odata.nextLink"] ?? null } satisfies ListMessagesPage;
  },

  async sendMail(accessToken, params) {
    const html = params.html ?? textToHtml(params.text ?? "");
    await providerFetch("microsoft", `${GRAPH}/me/sendMail`, {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        message: {
          subject: params.subject,
          body: { contentType: "HTML", content: html },
          toRecipients: graphRecipients(params.to),
          ccRecipients: graphRecipients(params.cc),
          bccRecipients: graphRecipients(params.bcc),
        },
        saveToSentItems: true,
      }),
    });
    return { providerMessageId: null, threadId: params.threadId ?? null } satisfies SendResult;
  },

  async replyToMessage(accessToken, original, params) {
    const action = params.replyAll ? "createReplyAll" : "createReply";
    const draft = await providerFetch<GraphMessage>(
      "microsoft",
      `${GRAPH}/me/messages/${encodeURIComponent(original.provider_message_id)}/${action}`,
      { method: "POST", accessToken, headers: MAIL_HEADERS, body: JSON.stringify({}) },
    );
    const html = params.html ?? textToHtml(params.text ?? "");
    const quoted = draft.body?.content ?? "";
    await providerFetch("microsoft", `${GRAPH}/me/messages/${encodeURIComponent(draft.id)}`, {
      method: "PATCH",
      accessToken,
      headers: MAIL_HEADERS,
      body: JSON.stringify({ body: { contentType: "HTML", content: `${html}<br/>${quoted}` } }),
    });
    await providerFetch("microsoft", `${GRAPH}/me/messages/${encodeURIComponent(draft.id)}/send`, {
      method: "POST",
      accessToken,
      headers: MAIL_HEADERS,
    });
    return { providerMessageId: draft.id, threadId: original.thread_id } satisfies SendResult;
  },

  async setRead(accessToken, id, read) {
    await providerFetch("microsoft", `${GRAPH}/me/messages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      accessToken,
      headers: MAIL_HEADERS,
      body: JSON.stringify({ isRead: read }),
    });
  },

  async setStarred(accessToken, id, starred) {
    await providerFetch("microsoft", `${GRAPH}/me/messages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      accessToken,
      headers: MAIL_HEADERS,
      body: JSON.stringify({ flag: { flagStatus: starred ? "flagged" : "notFlagged" } }),
    });
  },

  async listEvents(accessToken, { timeMin, timeMax }) {
    const events: NormalizedEvent[] = [];
    let url: string | null =
      `${GRAPH}/me/calendarView?startDateTime=${encodeURIComponent(timeMin.toISOString())}` +
      `&endDateTime=${encodeURIComponent(timeMax.toISOString())}&$top=250&$orderby=start/dateTime&$select=${EVENT_SELECT}`;
    for (let page = 0; page < 4 && url; page++) {
      const data: GraphPage<GraphEvent> = await providerFetch("microsoft", url, { accessToken, headers: CAL_HEADERS });
      events.push(...data.value.map(normalizeEvent));
      url = data["@odata.nextLink"] ?? null;
    }
    return events;
  },

  async createEvent(accessToken, params) {
    const base: Record<string, unknown> = {
      subject: params.title,
      body: { contentType: "HTML", content: params.description ? textToHtml(params.description) : "" },
      start: params.allDay
        ? { dateTime: `${params.start.slice(0, 10)}T00:00:00`, timeZone: params.timezone }
        : { dateTime: utcWallClock(params.start), timeZone: "UTC" },
      end: params.allDay
        ? { dateTime: `${params.end.slice(0, 10)}T00:00:00`, timeZone: params.timezone }
        : { dateTime: utcWallClock(params.end), timeZone: "UTC" },
      isAllDay: params.allDay,
      location: params.location ? { displayName: params.location } : undefined,
      attendees: params.attendees.map((a) => ({
        emailAddress: { address: a.email, name: a.name ?? undefined },
        type: "required",
      })),
    };
    const withMeeting = params.onlineMeeting
      ? { ...base, isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" }
      : base;
    try {
      const created = await providerFetch<GraphEvent>("microsoft", `${GRAPH}/me/events`, {
        method: "POST",
        accessToken,
        headers: CAL_HEADERS,
        body: JSON.stringify(withMeeting),
      });
      return normalizeEvent(created);
    } catch (error) {
      // Personal accounts may not support Teams meetings; fall back to a plain event.
      if (params.onlineMeeting && error instanceof ProviderHttpError && error.status === 400) {
        const created = await providerFetch<GraphEvent>("microsoft", `${GRAPH}/me/events`, {
          method: "POST",
          accessToken,
          headers: CAL_HEADERS,
          body: JSON.stringify(base),
        });
        return normalizeEvent(created);
      }
      throw error;
    }
  },

  async deleteEvent(accessToken, providerEventId) {
    await providerFetch("microsoft", `${GRAPH}/me/events/${encodeURIComponent(providerEventId)}`, {
      method: "DELETE",
      accessToken,
    });
  },
};
