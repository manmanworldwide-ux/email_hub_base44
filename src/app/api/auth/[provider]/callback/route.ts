import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProvider, isProvider } from "@/lib/providers";
import { OAUTH_STATE_COOKIE, verifyOAuthState } from "@/lib/providers/oauth-state";
import { popupResponse } from "@/lib/providers/popup";
import { getAccountRow, upsertAccountFromOAuth } from "@/lib/hub/accounts";
import { syncAccount } from "@/lib/hub/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function redirectWith(path: string, params: Record<string, string>) {
  const url = new URL(path, env.appUrl);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await context.params;
  if (!isProvider(providerId)) return redirectWith("/accounts", { error: "unknown_provider" });

  const params = request.nextUrl.searchParams;
  const payload = verifyOAuthState(request.cookies.get(OAUTH_STATE_COOKIE)?.value, params.get("state"));
  const popup = Boolean(payload?.popup);
  const next = payload?.next || "/accounts";

  const fail = (error: string, description = "") =>
    popup ? popupResponse({ ok: false, provider: providerId, error, description }, next) : redirectWith(next, { error, error_description: description });

  const oauthError = params.get("error");
  if (oauthError) return fail(oauthError, params.get("error_description") ?? "");

  const code = params.get("code");
  if (!code || !payload || payload.provider !== providerId) {
    return fail("invalid_state", "The sign-in attempt expired or was tampered with. Please try again.");
  }

  const { supabase, user } = await getCurrentUser();
  if (!user || user.id !== payload.userId) {
    return popup
      ? popupResponse({ ok: false, provider: providerId, error: "session_mismatch", description: "Your Email Hub session changed. Please sign in again." }, "/login")
      : redirectWith("/login", { error: "session_mismatch" });
  }

  try {
    const provider = getProvider(providerId);
    const tokens = await provider.exchangeCode(code);
    const profile = await provider.getProfile(tokens.access_token);
    const account = await upsertAccountFromOAuth(supabase, user.id, providerId, profile, tokens);

    // Small initial sync so the inbox is populated immediately; the scheduled job / manual sync continues.
    try {
      const row = await getAccountRow(supabase, user.id, account.id);
      await syncAccount(supabase, row, { maxMessages: 50 });
    } catch (error) {
      console.warn("[oauth] initial sync failed", error);
    }

    return popup ? popupResponse({ ok: true, provider: providerId, email: account.email }, next) : redirectWith(next, { connected: account.email });
  } catch (error) {
    console.error("[oauth] callback failed", error);
    const message = error instanceof Error ? error.message : "OAuth failed";
    return fail("oauth_failed", message.slice(0, 300));
  }
}
