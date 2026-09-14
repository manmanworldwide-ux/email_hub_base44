import type {
  CreateEventParams,
  EmailRow,
  ListMessagesPage,
  NormalizedEvent,
  Provider,
  ProviderProfile,
  SendMailParams,
  TokenSet,
} from "@/types";

export interface ReplyParams {
  fromName: string | null;
  fromEmail: string;
  text: string | null;
  html: string | null;
  replyAll: boolean;
}

export interface SendResult {
  providerMessageId: string | null;
  threadId: string | null;
}

export interface MailProvider {
  readonly id: Provider;
  readonly label: string;
  getAuthUrl(state: string): Promise<string>;
  exchangeCode(code: string): Promise<TokenSet>;
  refreshAccessToken(refreshToken: string): Promise<TokenSet>;
  getProfile(accessToken: string): Promise<ProviderProfile>;
  listMessages(
    accessToken: string,
    opts: { since: Date; pageToken: string | null; maxResults: number },
  ): Promise<ListMessagesPage>;
  sendMail(accessToken: string, params: SendMailParams): Promise<SendResult>;
  replyToMessage(accessToken: string, original: EmailRow, params: ReplyParams): Promise<SendResult>;
  setRead(accessToken: string, providerMessageId: string, read: boolean): Promise<void>;
  setStarred(accessToken: string, providerMessageId: string, starred: boolean): Promise<void>;
  listEvents(accessToken: string, opts: { timeMin: Date; timeMax: Date }): Promise<NormalizedEvent[]>;
  createEvent(accessToken: string, params: CreateEventParams): Promise<NormalizedEvent>;
  deleteEvent(accessToken: string, providerEventId: string): Promise<void>;
}

export class ProviderHttpError extends Error {
  provider: Provider;
  status: number;
  body: unknown;

  constructor(provider: Provider, status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ProviderHttpError";
    this.provider = provider;
    this.status = status;
    this.body = body;
  }

  /** True when the provider rejected our credentials and the user must reconnect. */
  get isAuthError(): boolean {
    return this.status === 401 || (this.status === 400 && /invalid_grant/i.test(this.message));
  }
}

function extractMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const error = obj.error;
  if (typeof error === "string") {
    const desc = obj.error_description;
    return typeof desc === "string" ? `${error}: ${desc}` : error;
  }
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string") return typeof e.code === "string" ? `${e.code}: ${e.message}` : e.message;
  }
  return null;
}

export async function providerFetch<T>(
  provider: Provider,
  url: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.accessToken) headers.set("Authorization", `Bearer ${init.accessToken}`);
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const { accessToken: _ignored, ...rest } = init;
  void _ignored;

  const response = await fetch(url, { ...rest, headers, cache: "no-store" });
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  if (!response.ok) {
    throw new ProviderHttpError(
      provider,
      response.status,
      extractMessage(json) ?? `${provider} request failed with status ${response.status}`,
      json,
    );
  }
  return json as T;
}

export function formEncode(data: Record<string, string>): string {
  return new URLSearchParams(data).toString();
}

export function expiresAtFrom(expiresIn: number | undefined): string | null {
  if (!expiresIn) return null;
  return new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Normalises provider date strings (Graph returns 7 fractional digits and no zone). */
export function toIso(value: string | undefined | null, assumeUtc = false): string | null {
  if (!value) return null;
  let s = value.replace(/(\.\d{3})\d+/, "$1");
  if (assumeUtc && !/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) s = `${s}Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
