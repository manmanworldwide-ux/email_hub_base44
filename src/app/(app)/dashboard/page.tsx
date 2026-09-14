import Link from "next/link";
import { ArrowRight, Bot, CalendarDays, PenSquare, Plug, Video } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listAccounts } from "@/lib/hub/accounts";
import { listEmails } from "@/lib/hub/emails";
import { listEvents } from "@/lib/hub/calendar";
import { getAnalyticsSummary } from "@/lib/hub/analytics";
import { hasLlmForUser } from "@/lib/ai/llm";
import { providerAvailability } from "@/lib/providers/credentials";
import { AddMailboxButton } from "@/components/connect-mailbox";
import { StatTile } from "@/components/charts";
import { EmailRow } from "@/components/email-row";
import { SyncAccountButton } from "@/components/account-actions";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { Alert, Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, priorityTone } from "@/components/ui";
import { formatDateTime, providerLabel } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireSession();
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 86_400_000);

  const [accounts, summary, recent, needsReply, events, hasAi, apiKeys, availability] = await Promise.all([
    listAccounts(supabase, user.id),
    getAnalyticsSummary(supabase, user.id, 7),
    listEmails(supabase, user.id, { limit: 8, offset: 0, folder: "inbox" }),
    listEmails(supabase, user.id, { limit: 5, offset: 0, requiresResponse: true }),
    listEvents(supabase, user.id, { limit: 6, from: now.toISOString(), to: in7d.toISOString() }),
    hasLlmForUser(supabase, user.id),
    supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("revoked_at", null),
    providerAvailability(),
  ]);
  const isAdmin = user.role === "admin";

  const onboarding = {
    hasAccounts: accounts.length > 0,
    hasEmails: summary.totals.emails > 0,
    hasAi,
    canApiKeys: user.role === "admin" || user.canCreateApiKeys,
    hasApiKey: (apiKeys.count ?? 0) > 0,
    tourDone: Boolean(user.tourCompletedAt),
  };

  const firstName = user.fullName?.split(" ")[0];

  return (
    <>
      {sp.error === "admin_only" ? (
        <div className="mb-4">
          <Alert tone="warning">That area is only available to administrators.</Alert>
        </div>
      ) : null}

      <PageHeader
        title={firstName ? `Good to see you, ${firstName}` : "Dashboard"}
        description={accounts.length ? `${accounts.length} mailbox${accounts.length === 1 ? "" : "es"} · last 7 days` : "Connect your first mailbox to start collecting and analysing email."}
        action={
          accounts.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <SyncAccountButton size="md" />
              <LinkButton href="/compose" variant="secondary">
                <PenSquare className="h-4 w-4" /> Compose
              </LinkButton>
              <LinkButton href="/assistant">
                <Bot className="h-4 w-4" /> Ask AI
              </LinkButton>
            </div>
          ) : undefined
        }
      />

      <OnboardingChecklist state={onboarding} />

      {accounts.length === 0 ? (
        <Card className="p-8">
          <div className="mx-auto max-w-xl text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Plug className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-neutral-900">No mailboxes connected yet</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Connect two or more Gmail and Outlook accounts. Email Hub syncs messages and calendars into one place, analyses them with AI and exposes everything through the assistant and the API.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <AddMailboxButton availability={availability} isAdmin={isAdmin} label="Add your first mailbox" />
              {isAdmin && !availability.google && !availability.microsoft ? (
                <LinkButton href="/admin/connectors" variant="secondary">
                  Set up Gmail / Outlook connectors
                </LinkButton>
              ) : null}
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            <StatTile label="Unread" value={summary.totals.unread} hint="across all inboxes" />
            <StatTile label="Received (7d)" value={summary.totals.emails_in_period} hint={`${summary.totals.sent_in_period} sent`} />
            <StatTile label="Needs a reply" value={summary.totals.requires_response} hint="flagged by AI" />
            <StatTile label="Meetings (7d)" value={summary.totals.upcoming_events_7d} />
            <StatTile label="Analysed" value={summary.totals.analyzed} hint={`of ${summary.totals.emails} emails`} className="col-span-2 lg:col-span-1" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Recent inbox"
                description="Newest messages across every account"
                action={
                  <Link href="/inbox" className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                    Open inbox <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              />
              {recent.items.length ? recent.items.map((e) => <EmailRow key={e.id} email={e} />) : <EmptyState title="No emails yet" description="Run a sync to pull in your mail." />}
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader
                  title="Upcoming meetings"
                  action={
                    <Link href="/calendar" className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                      Calendar <ArrowRight className="h-3 w-3" />
                    </Link>
                  }
                />
                {events.length ? (
                  <ul className="divide-y divide-neutral-100">
                    {events.map((ev) => (
                      <li key={ev.id} className="flex items-start gap-3 px-5 py-3">
                        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-900">{ev.title || "(untitled)"}</p>
                          <p className="text-xs text-neutral-500">
                            {ev.all_day ? new Date(ev.start_at).toLocaleDateString() : formatDateTime(ev.start_at)}
                            {ev.account ? ` · ${providerLabel(ev.account.provider)}` : ""}
                          </p>
                        </div>
                        {ev.meeting_link ? (
                          <a href={ev.meeting_link} target="_blank" rel="noreferrer" className="text-neutral-400 hover:text-brand-600" title="Join">
                            <Video className="h-4 w-4" />
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="Nothing scheduled" description="No events in the next 7 days." />
                )}
              </Card>

              <Card>
                <CardHeader title="Needs your reply" description="Emails the AI flagged as awaiting a response" />
                {needsReply.items.length ? (
                  <ul className="divide-y divide-neutral-100">
                    {needsReply.items.map((e) => (
                      <li key={e.id}>
                        <Link href={`/inbox/${e.id}`} className="block px-5 py-3 hover:bg-neutral-50">
                          <p className="flex items-center gap-2 text-sm">
                            <span className="truncate font-medium text-neutral-900">{e.subject || "(no subject)"}</span>
                            {e.analysis?.priority ? <Badge tone={priorityTone(e.analysis.priority)}>{e.analysis.priority}</Badge> : null}
                          </p>
                          <p className="truncate text-xs text-neutral-500">
                            {e.from_name || e.from_email} · {e.analysis?.summary}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title={hasAi ? "All caught up" : "AI not set up"} description={hasAi ? "Nothing is waiting on you right now." : "Choose an AI provider in Settings → AI to get reply suggestions."} />
                )}
              </Card>
            </div>
          </div>

          <Card className="mt-6">
            <CardHeader title="Mailboxes" action={<Link href="/accounts" className="text-xs font-medium text-brand-700 hover:underline">Manage</Link>} />
            <div className="grid gap-px bg-neutral-100 sm:grid-cols-2 lg:grid-cols-4">
              {summary.by_account.map((a) => {
                const account = accounts.find((x) => x.id === a.account_id);
                return (
                  <div key={a.account_id} className="bg-white px-5 py-4">
                    <p className="flex items-center gap-2 text-xs text-neutral-500">
                      <Badge>{providerLabel(a.provider)}</Badge>
                      {account?.status && account.status !== "active" ? <Badge tone="critical">{account.status}</Badge> : null}
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-neutral-900" title={a.email}>
                      {a.email}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {a.emails} emails · {a.unread} unread
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
