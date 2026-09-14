import Link from "next/link";
import { CalendarDays, Mail, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listAccounts } from "@/lib/hub/accounts";
import { getAnalyticsSummary } from "@/lib/hub/analytics";
import { getAllConnectorStatus } from "@/lib/providers/credentials";
import { DisconnectAccountButton, SyncAccountButton } from "@/components/account-actions";
import { AddMailboxButton, ConnectProviderButton } from "@/components/connect-mailbox";
import { ProviderMark } from "@/components/provider-marks";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { cn, formatRelative, providerLabel } from "@/lib/utils";
import { env } from "@/lib/env";

export const metadata = { title: "Accounts" };

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; error_description?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, user } = await requireSession();
  const [accounts, summary, connectors] = await Promise.all([
    listAccounts(supabase, user.id),
    getAnalyticsSummary(supabase, user.id, 30),
    getAllConnectorStatus(),
  ]);
  const counts = new Map(summary.by_account.map((a) => [a.account_id, a]));
  const availability = { google: connectors.google.configured, microsoft: connectors.microsoft.configured };
  const isAdmin = user.role === "admin";

  const providers = [
    { id: "google" as const, name: "Gmail", sub: "Google Workspace & personal Gmail", scopes: "Read & send mail · Google Calendar" },
    { id: "microsoft" as const, name: "Outlook", sub: "Microsoft 365, Exchange & Outlook.com", scopes: "Read & send mail · Outlook Calendar" },
  ].map((p) => ({ ...p, configured: availability[p.id], count: accounts.filter((a) => a.provider === p.id).length }));

  return (
    <>
      <PageHeader
        title="Connected accounts"
        description="Link every mailbox you use. Each one syncs independently into your unified inbox and calendar."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {accounts.length ? <SyncAccountButton size="md" /> : null}
            <AddMailboxButton availability={availability} isAdmin={isAdmin} />
          </div>
        }
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

      <div className="grid gap-4 md:grid-cols-2">
        {providers.map((p) => (
          <div key={p.id} className={cn("group relative overflow-hidden rounded-2xl border bg-white p-5 transition-shadow hover:shadow-lg", p.configured ? "border-neutral-200" : "border-dashed border-neutral-300")}>
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neutral-50 ring-1 ring-neutral-200">
                <ProviderMark provider={p.id} className="h-8 w-8" />
              </span>
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
              <p className="text-[11px] text-neutral-500">
                {p.configured ? "A sign-in window opens; log in to the account and approve access." : isAdmin ? "Not set up yet - add the OAuth client under Mail connectors." : "Not set up yet - ask your administrator."}
              </p>
              {p.configured ? (
                <ConnectProviderButton provider={p.id} configured size="sm">
                  {p.count ? `Add another ${p.name}` : `Connect ${p.name}`}
                </ConnectProviderButton>
              ) : isAdmin ? (
                <Link href="/admin/connectors" className="text-xs font-medium text-brand-700 hover:underline">
                  Set up →
                </Link>
              ) : (
                <Badge tone="warning">needs setup</Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader title={`${accounts.length} mailbox${accounts.length === 1 ? "" : "es"}`} description="Sync status per account" />
        {accounts.length === 0 ? (
          <EmptyState
            title="No accounts connected"
            description="Use Add mailbox to connect your first Gmail or Outlook account."
            action={<AddMailboxButton availability={availability} isAdmin={isAdmin} />}
          />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {accounts.map((a) => {
              const c = counts.get(a.id);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-50 ring-1 ring-neutral-200">
                    <ProviderMark provider={a.provider} className="h-6 w-6" />
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
                      <ConnectProviderButton provider={a.provider} configured={availability[a.provider]} size="sm">
                        Reconnect
                      </ConnectProviderButton>
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
