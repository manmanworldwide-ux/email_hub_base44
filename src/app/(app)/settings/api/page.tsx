import Link from "next/link";
import { Lock } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listApiKeys } from "@/lib/api/keys";
import { ALL_SCOPES, SCOPE_DESCRIPTIONS } from "@/lib/api/auth";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { ApiKeysManager } from "@/components/api-keys-manager";
import { Badge, Card, CardHeader } from "@/components/ui";
import { env } from "@/lib/env";

export const metadata = { title: "API access" };

const METHOD_TONE: Record<string, "brand" | "good" | "warning" | "critical"> = {
  GET: "brand",
  POST: "good",
  PUT: "warning",
  PATCH: "warning",
  DELETE: "critical",
};

export default async function ApiSettingsPage() {
  const { supabase, user } = await requireSession();
  const allowed = user.role === "admin" || user.canCreateApiKeys;
  const keys = await listApiKeys(supabase, user.id);
  const base = env.appUrl;
  const scopes = ALL_SCOPES.map((scope) => ({ scope, description: SCOPE_DESCRIPTIONS[scope] }));

  const groups = new Map<string, typeof ENDPOINTS>();
  for (const e of ENDPOINTS.filter((x) => x.scope !== "admin")) groups.set(e.tag, [...(groups.get(e.tag) ?? []), e]);

  return (
    <>
      {allowed ? (
        <ApiKeysManager keys={keys} scopes={scopes} />
      ) : (
        <Card className="p-8">
          <div className="mx-auto max-w-lg text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-500">
              <Lock className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-base font-semibold text-neutral-900">API tokens are not enabled for your account</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Access tokens let external AI agents (such as Base44) read and act on your inbox. Ask an administrator to enable token generation for you under Administration → Users.
            </p>
            {keys.length ? <p className="mt-3 text-xs text-neutral-500">Existing tokens keep working until revoked.</p> : null}
          </div>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Connect an AI agent (Base44 or any HTTP client)" description="Every endpoint accepts the token as a Bearer token or an x-api-key header." />
        <div className="grid gap-4 px-5 py-4 text-xs lg:grid-cols-2">
          <div>
            <p className="font-medium text-neutral-900">1. Base URL &amp; auth</p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-neutral-900 p-3 font-mono text-[11px] leading-5 text-neutral-100">{`BASE_URL=${base}
Authorization: Bearer ehk_live_...        # or: x-api-key: ehk_live_...

# verify the token
curl -H "Authorization: Bearer $TOKEN" ${base}/api/v1/me`}</pre>
            <p className="mt-3 font-medium text-neutral-900">2. OpenAPI spec (import into Base44 / Postman)</p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-neutral-900 p-3 font-mono text-[11px] leading-5 text-neutral-100">
              <Link href="/api/v1/openapi.json" className="underline">{`${base}/api/v1/openapi.json`}</Link>
            </pre>
          </div>
          <div>
            <p className="font-medium text-neutral-900">3. Typical calls</p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-neutral-900 p-3 font-mono text-[11px] leading-5 text-neutral-100">{`# unread, urgent emails
GET /api/v1/emails?unread=true&priority=urgent

# ask the assistant (tool-using, multi-turn)
POST /api/v1/ai/assistant
{ "message": "Summarise today's emails and draft replies", "timezone": "Europe/London" }

# reply to an email
POST /api/v1/emails/{id}/reply
{ "body_text": "Thanks - confirmed.", "reply_all": false }

# schedule a meeting with a Meet/Teams link
POST /api/v1/calendar/events
{ "account_id": "...", "title": "Kickoff", "start": "2026-09-15T10:00:00+01:00",
  "end": "2026-09-15T10:30:00+01:00", "attendees": ["jane@example.com"] }`}</pre>
          </div>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Endpoint reference" description="Responses are wrapped as { ok, data, meta? } or { ok: false, error: { code, message } }." />
        <div className="divide-y divide-neutral-100">
          {[...groups.entries()].map(([tag, list]) => (
            <div key={tag} className="px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{tag}</p>
              <ul className="space-y-2">
                {list.map((e) => (
                  <li key={`${e.method} ${e.path}`} className="grid gap-1 md:grid-cols-[70px_minmax(0,320px)_1fr_auto] md:items-baseline md:gap-3">
                    <Badge tone={METHOD_TONE[e.method]} className="justify-center font-mono">
                      {e.method}
                    </Badge>
                    <code className="truncate font-mono text-xs text-neutral-900">{e.path}</code>
                    <span className="text-xs text-neutral-600">
                      <span className="font-medium text-neutral-800">{e.summary}</span>
                      {e.description ? ` — ${e.description}` : ""}
                      {e.query ? <span className="block text-[11px] text-neutral-500">Query: {Object.keys(e.query).join(", ")}</span> : null}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-500">{e.scope}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
