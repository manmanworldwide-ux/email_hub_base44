import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { escapeHtml } from "@/lib/utils";
import { OAUTH_STATE_COOKIE } from "./oauth-state";

export interface OAuthPopupResult {
  ok: boolean;
  provider?: string;
  email?: string;
  error?: string;
  description?: string;
}

/**
 * Small HTML page returned at the end of a popup OAuth flow. It hands the result to the
 * opener window via postMessage and closes itself; without an opener it redirects instead.
 */
export function popupResponse(result: OAuthPopupResult, fallbackPath = "/accounts"): NextResponse {
  const fallback = new URL(fallbackPath, env.appUrl);
  if (result.ok && result.email) fallback.searchParams.set("connected", result.email);
  if (!result.ok && result.error) {
    fallback.searchParams.set("error", result.error);
    if (result.description) fallback.searchParams.set("error_description", result.description);
  }
  const message = JSON.stringify({ source: "email-hub", type: "oauth-result", ...result }).replace(/</g, "\\u003c");
  const fallbackJson = JSON.stringify(fallback.toString()).replace(/</g, "\\u003c");
  const headline = result.ok ? "Mailbox connected" : "Connection failed";
  const detail = result.ok
    ? `${escapeHtml(result.email ?? "")} is now linked. You can close this window.`
    : escapeHtml(result.description || result.error || "Something went wrong.");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email Hub</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
  .card{max-width:380px;padding:28px 32px;border-radius:20px;background:#171717;border:1px solid rgba(255,255,255,.08);text-align:center}
  .dot{width:44px;height:44px;border-radius:14px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;background:${result.ok ? "#14532d" : "#7f1d1d"};font-size:22px}
  h1{font-size:17px;margin:0 0 6px}p{margin:0;font-size:13px;color:#a3a3a3;line-height:1.5}
  a{display:inline-block;margin-top:16px;color:#93c5fd;font-size:13px}
</style></head>
<body><div class="card"><div class="dot">${result.ok ? "&#10003;" : "&#33;"}</div><h1>${headline}</h1><p>${detail}</p><a href="${escapeHtml(fallback.toString())}">Continue to Email Hub</a></div>
<script>
(function(){
  var msg=${message}; var fallback=${fallbackJson};
  try{
    if(window.opener && !window.opener.closed){
      window.opener.postMessage(msg, window.location.origin);
      setTimeout(function(){ window.close(); }, 600);
      return;
    }
  }catch(e){}
  setTimeout(function(){ window.location.replace(fallback); }, 1200);
})();
</script></body></html>`;

  const response = new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}
