import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProvider, isProvider } from "@/lib/providers";
import { getOAuthCredentials, PROVIDER_LABELS } from "@/lib/providers/credentials";
import { createOAuthState, OAUTH_STATE_COOKIE } from "@/lib/providers/oauth-state";
import { popupResponse } from "@/lib/providers/popup";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Starts the OAuth flow for connecting a Gmail or Outlook mailbox. Requires a logged-in session.
 * Add `?popup=1` when opened in a popup window: the callback then posts the result back to the
 * opener and closes instead of redirecting.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await context.params;
  const popup = request.nextUrl.searchParams.get("popup") === "1";
  const next = request.nextUrl.searchParams.get("next") ?? "/accounts";

  if (!isProvider(providerId)) {
    return NextResponse.json({ ok: false, error: { code: "unknown_provider", message: "Unknown provider" } }, { status: 404 });
  }

  const credentials = await getOAuthCredentials(providerId);
  if (!credentials) {
    const description = `${PROVIDER_LABELS[providerId]} is not set up yet. An administrator must add the OAuth client under Administration → Mail connectors.`;
    if (popup) return popupResponse({ ok: false, provider: providerId, error: `${providerId}_not_configured`, description }, next);
    const url = new URL(next, env.appUrl);
    url.searchParams.set("error", `${providerId}_not_configured`);
    url.searchParams.set("error_description", description);
    return NextResponse.redirect(url);
  }

  const { user } = await getCurrentUser();
  if (!user) {
    if (popup) return popupResponse({ ok: false, provider: providerId, error: "not_signed_in", description: "Please sign in to Email Hub first." }, "/login");
    const url = new URL("/login", env.appUrl);
    url.searchParams.set("next", `/api/auth/${providerId}`);
    return NextResponse.redirect(url);
  }

  const { state, cookieValue } = createOAuthState({ userId: user.id, provider: providerId, next, popup });
  const response = NextResponse.redirect(await getProvider(providerId).getAuthUrl(state));
  response.cookies.set(OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    path: "/",
    maxAge: 600,
  });
  return response;
}
