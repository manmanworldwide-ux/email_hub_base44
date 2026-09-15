import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/invite"];

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-api-key",
  "Access-Control-Expose-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes authenticate themselves (API key / JWT / cookie). Add CORS so external agents
  // (e.g. Base44) can call them from any origin with a bearer token; cookies are never sent
  // cross-origin because credentials are not allowed with a wildcard origin.
  if (pathname.startsWith("/api/")) {
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }
    const response = NextResponse.next();
    for (const [k, v] of Object.entries(CORS_HEADERS)) response.headers.set(k, v);
    return response;
  }

  const { supabaseResponse, user } = await updateSession(request);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
