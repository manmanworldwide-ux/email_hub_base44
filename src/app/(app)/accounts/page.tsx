import { CalendarDays, Mail, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listAccounts } from "@/lib/hub/accounts";
import { getAnalyticsSummary } from "@/lib/hub/analytics";
import { DisconnectAccountButton, SyncAccountButton } from "@/components/account-actions";
import { Alert, Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { cn, formatRelative, providerLabel } from "@/lib/utils";
import { env } from "@/lib/env";

export const metadata = { title: "Accounts" };

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.8 6C12.2 13.6 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z" />
      <path fill="#FBBC05" d="M10.3 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.4 0-11.8-4.1-13.7-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function OutlookMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="4" y="10" width="24" height="28" rx="3" fill="#0F6CBD" />
      <ellipse cx="16" cy="24" rx="7" ry="8" fill="#fff" />
      <ellipse cx="16" cy="24" rx="3.5" ry="4.5" fill="#0F6CBD" />
      <path d="M28 16h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H28V16z" fill="#28A8EA" />
      <path d="M28 16h16l-8 6-8-6z" fill="#50D9FF" />
    </svg>
  );
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; error_description?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, user } = await requireSession();
  const [accounts, summary] = await Promise.all([listAccounts(supabase, user.id), getAnalyticsSummary(supabase, user.id, 30)]);
  const counts = new Map(summary.by_account.map((a) => [a.account_id, a]));

  const providers = [
    {
      id: "google",
      name: "Gmail",
      sub: "Google Workspace & personal Gmail",
      href: "/api/auth/google",
      configured: env.google.configured,
      mark: <GoogleMark className="h-8 w-8" />,
      scopes: "Read & send mail · Google Calendar",
      count: accounts.filter((a) => a.provider === "google").length,
    },
    {
      id: "microsoft",
      name: "Outlook",
      sub: "Microsoft 365, Exchange & Outlook.com",
      href: "/api/auth/microsoft",
      configured: env.microsoft.configured,
      mark: <OutlookMark className="h-8 w-8" />,
      scopes: "Read & send mail · Outlook Calendar",
      count: accounts.filter((a) => a.provider === "microsoft").length,
    },
  ];

  return (
    <>
      <PageHeader
        title="Connected accounts"
        description="Link every mailbox you use. Each one syncs independently into your unified inbox and calendar."
        action={accounts.length ? <SyncAccountButton size="md" /> : undefined}
      />

      <div className="mb-6 space-y-2">
        {sp.connected ? (
          <Alert tone="good">
            Connected <strong>{sp.connected}</strong>. The first messages have been synced; the rest follows in the background.
          </Alert>
        ) : null}
        {sp.error ? (
          <Alert tone="critical">
            Connection failed: {sp.error}
            {sp.error_description ? ` – ${sp.error_description}` : ""}
          </Alert>
        ) : null}
      </div>

      {/* Provider cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {providers.map((p) => (
          <div key={p.id} className={cn("group relative overflow-hidden rounded-2xl border bg-white p-5 transition-shadow hover:shadow-lg", p.configured ? "border-neutral-200" : "border-dashed border-neutral-300")}>
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neutral-50 ring-1 ring-neutral-200">{p.mark}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-base font-semibold text-neutral-900">
                  {p.name}
                  {p.count ? <Badge tone="good">{p.count} connected</Badge> : null}
                </p>
                <p className="text-xs text-neutral-500">{p.sub}</p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-600">
                  <ShieldCheck className="h-3.5 w-3.5 text-neutral-400" /> {p.scopes}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[11px] text-neutral-500">{p.configured ? "You will be redirected to sign in and grant access." : "Not configured on this server yet."}</p>
              {p.configured ? (
                <LinkButton href={p.href} size="sm">
                  {p.count ? `Add another ${p.name}` : `Connect ${p.name}`}
                </LinkButton>
              ) : (
                <Badge tone="warning">needs setup</Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      {(!env.google.configured || !env.microsoft.configured) && user.role === "admin" ? (
        <div className="mt-3">
          <Alert tone="warning">
            {!env.google.configured ? "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing. " : ""}
            {!env.microsoft.configured ? "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET are missing. " : ""}
            Add them to the server environment to enable that provider (see README).
          </Alert>
        </div>
      ) : null}

      <Card className="mt-6">
        <CardHeader title={`${accounts.length} mailbox${accounts.length === 1 ? "" : "es"}`} description="Sync status per account" />
        {accounts.length === 0 ? (
          <EmptyState title="No accounts connected" description="Use the cards above to connect your first Gmail or Outlook mailbox." />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {accounts.map((a) => {
              const c = counts.get(a.id);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-50 ring-1 ring-neutral-200">
                    {a.provider === "google" ? <GoogleMark className="h-6 w-6" /> : <OutlookMark className="h-6 w-6" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-900">
                      {a.email}
                      <Badge>{providerLabel(a.provider)}</Badge>
                      {a.status === "active" ? <Badge tone="good">active</Badge> : <Badge tone="critical">{a.status.replace("_", " ")}</Badge>}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                      {a.display_name ? <span>{a.display_name}</span> : null}
                      {c ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {c.emails} emails · {c.unread} unread
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" /> mail {formatRelative(a.last_synced_at)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> calendar {formatRelative(a.last_calendar_synced_at)}
                      </span>
                    </p>
                    {a.last_error ? <p className="mt-1 text-xs text-red-600">{a.last_error}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.status === "needs_reauth" ? (
                      <LinkButton href={`/api/auth/${a.provider}`} size="sm">
                        Reconnect
                      </LinkButton>
                    ) : null}
                    <SyncAccountButton accountId={a.id} />
                    <DisconnectAccountButton accountId={a.id} email={a.email} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { icon: RefreshCw, title: "Initial backfill", body: `The last ${env.sync.initialDays} days of mail are imported in batches of ${env.sync.maxMessagesPerSync}. Run “Sync” again (or wait for the scheduled job) to continue.` },
          { icon: CalendarDays, title: "Incremental updates", body: "Each sync fetches anything received since the previous run (with a 24h overlap to catch read-state changes) plus calendar events from 7 days ago to 60 days ahead." },
          { icon: Sparkles, title: "AI analysis", body: env.ai.autoAnalyze ? `Up to ${env.ai.autoAnalyzeLimit} new emails are analysed automatically after each sync using your configured AI provider.` : "Automatic analysis is off; analyse emails on demand or via the API." },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border border-neutral-200 bg-white p-4 text-xs text-neutral-600">
            <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
              <item.icon className="h-4 w-4 text-brand-600" /> {item.title}
            </p>
            <p className="mt-1.5">{item.body}</p>
          </div>
        ))}
      </div>
    </>
  );
}
