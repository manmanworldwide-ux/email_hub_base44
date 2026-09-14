import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProvider, isProvider } from "@/lib/providers";
import { createOAuthState, OAUTH_STATE_COOKIE } from "@/lib/providers/oauth-state";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Starts the OAuth flow for connecting a Gmail or Outlook mailbox. Requires a logged-in session. */
export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await context.params;
  if (!isProvider(providerId)) {
    return NextResponse.json({ ok: false, error: { code: "unknown_provider", message: "Unknown provider" } }, { status: 404 });
  }

  const configured = providerId === "google" ? env.google.configured : env.microsoft.configured;
  if (!configured) {
    const url = new URL("/accounts", env.appUrl);
    url.searchParams.set("error", `${providerId}_not_configured`);
    return NextResponse.redirect(url);
  }

  const { user } = await getCurrentUser();
  if (!user) {
    const url = new URL("/login", env.appUrl);
    url.searchParams.set("next", `/api/auth/${providerId}`);
    return NextResponse.redirect(url);
  }

  const next = request.nextUrl.searchParams.get("next") ?? "/accounts";
  const { state, cookieValue } = createOAuthState({ userId: user.id, provider: providerId, next });
  const response = NextResponse.redirect(getProvider(providerId).getAuthUrl(state));
  response.cookies.set(OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    path: "/",
    maxAge: 600,
  });
  return response;
}
