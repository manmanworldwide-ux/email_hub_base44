import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { randomToken, safeEqual } from "@/lib/crypto";
import type { Provider } from "@/types";

export const OAUTH_STATE_COOKIE = "eh_oauth_state";
const MAX_AGE_MS = 10 * 60_000;

export interface OAuthStatePayload {
  userId: string;
  provider: Provider;
  next: string;
  state: string;
  ts: number;
}

function sign(data: string): string {
  return createHmac("sha256", env.tokenEncryptionKey).update(data).digest("base64url");
}

/** Creates a random OAuth `state` and a signed cookie value binding it to the user. */
export function createOAuthState(input: { userId: string; provider: Provider; next?: string }) {
  const payload: OAuthStatePayload = {
    userId: input.userId,
    provider: input.provider,
    next: input.next ?? "/accounts",
    state: randomToken(16),
    ts: Date.now(),
  };
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { state: payload.state, cookieValue: `${data}.${sign(data)}` };
}

export function verifyOAuthState(cookieValue: string | undefined, state: string | null): OAuthStatePayload | null {
  if (!cookieValue || !state) return null;
  const [data, signature] = cookieValue.split(".");
  if (!data || !signature) return null;
  if (!safeEqual(sign(data), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as OAuthStatePayload;
    if (payload.state !== state) return null;
    if (Date.now() - payload.ts > MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
