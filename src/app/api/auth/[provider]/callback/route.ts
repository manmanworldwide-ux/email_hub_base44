import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProvider, isProvider } from "@/lib/providers";
import { OAUTH_STATE_COOKIE, verifyOAuthState } from "@/lib/providers/oauth-state";
import { getAccountRow, upsertAccountFromOAuth } from "@/lib/hub/accounts";
import { syncAccount } from "@/lib/hub/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function redirectWith(path: string, params: Record<string, string>) {
  const url = new URL(path, env.appUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await context.params;
  if (!isProvider(providerId)) return redirectWith("/accounts", { error: "unknown_provider" });

  const params = request.nextUrl.searchParams;
  const oauthError = params.get("error");
  if (oauthError) {
    return redirectWith("/accounts", { error: oauthError, error_description: params.get("error_description") ?? "" });
  }

  const code = params.get("code");
  const payload = verifyOAuthState(request.cookies.get(OAUTH_STATE_COOKIE)?.value, params.get("state"));
  if (!code || !payload || payload.provider !== providerId) {
    return redirectWith("/accounts", { error: "invalid_state" });
  }

  const { supabase, user } = await getCurrentUser();
  if (!user || user.id !== payload.userId) {
    return redirectWith("/login", { error: "session_mismatch" });
  }

  try {
    const provider = getProvider(providerId);
    const tokens = await provider.exchangeCode(code);
    const profile = await provider.getProfile(tokens.access_token);
    const account = await upsertAccountFromOAuth(supabase, user.id, providerId, profile, tokens);

    // Kick off a small initial sync so the inbox is populated immediately; the scheduled
    // job / manual sync continues the backfill.
    try {
      const row = await getAccountRow(supabase, user.id, account.id);
      await syncAccount(supabase, row, { maxMessages: 50 });
    } catch (error) {
      console.warn("[oauth] initial sync failed", error);
    }

    return redirectWith(payload.next || "/accounts", { connected: account.email });
  } catch (error) {
    console.error("[oauth] callback failed", error);
    const message = error instanceof Error ? error.message : "OAuth failed";
    return redirectWith("/accounts", { error: "oauth_failed", error_description: message.slice(0, 300) });
  }
}
