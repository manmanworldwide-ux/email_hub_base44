import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getAnalyticsSummary } from "@/lib/hub/analytics";
import { HorizontalBars, SegmentBar, StatTile, VolumeChart } from "@/components/charts";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { cn, providerLabel } from "@/lib/utils";

export const metadata = { title: "Insights" };

const PRIORITY_ORDER = ["urgent", "high", "normal", "low"];
// Ordinal ramp: one hue, darker = more urgent (sequential steps 600/450/300/200).
const PRIORITY_COLORS: Record<string, string> = { urgent: "#184f95", high: "#2a78d6", normal: "#6da7ec", low: "#b7d3f6" };
// Diverging: negative (red) / neutral (gray midpoint) / positive (blue).
const SENTIMENT_ORDER = ["negative", "neutral", "positive"];
const SENTIMENT_COLORS: Record<string, string> = { negative: "#e34948", neutral: "#c3c2b7", positive: "#2a78d6" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const { supabase, user } = await requireUser();
  const s = await getAnalyticsSummary(supabase, user.id, days);

  const priority = PRIORITY_ORDER.map((key) => ({
    key,
    label: key,
    count: s.by_priority.find((p) => p.key === key)?.count ?? 0,
    color: PRIORITY_COLORS[key],
  }));
  const sentiment = SENTIMENT_ORDER.map((key) => ({
    key,
    label: key,
    count: s.by_sentiment.find((p) => p.key === key)?.count ?? 0,
    color: SENTIMENT_COLORS[key],
  }));

  return (
    <>
      <PageHeader
        title="Insights"
        description="What your inboxes look like, powered by sync data and AI analysis."
        action={
          <div className="flex rounded-md border border-neutral-300 bg-white p-0.5 text-xs">
            {[7, 30, 90].map((d) => (
              <Link key={d} href={`/insights?days=${d}`} className={cn("rounded px-3 py-1.5", d === days ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100")}>
                {d} days
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={`Received (${days}d)`} value={s.totals.emails_in_period} hint={`${Math.round(s.totals.emails_in_period / days)} per day`} />
        <StatTile label={`Sent (${days}d)`} value={s.totals.sent_in_period} />
        <StatTile label="Unread now" value={s.totals.unread} />
        <StatTile label="Awaiting your reply" value={s.totals.requires_response} hint="AI flagged" />
      </div>

      <Card className="mt-6">
        <CardHeader title="Volume per day" description="Emails received and sent across all mailboxes" />
        <div className="px-5 py-4">
          <VolumeChart data={s.volume_by_day} />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Categories" description={`AI-classified emails, last ${days} days`} />
          <div className="px-5 py-4">
            <HorizontalBars data={s.by_category} emptyLabel="No analysed emails in this period." />
          </div>
        </Card>
        <Card>
          <CardHeader title="Priority" description="Share of analysed emails" />
          <div className="px-5 py-4">
            <SegmentBar segments={priority} emptyLabel="No analysed emails in this period." />
          </div>
        </Card>
        <Card>
          <CardHeader title="Sentiment" description="Tone of incoming mail" />
          <div className="px-5 py-4">
            <SegmentBar segments={sentiment} emptyLabel="No analysed emails in this period." />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="overflow-x-auto">
          <CardHeader title="Top senders" description={`Most frequent senders, last ${days} days`} />
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-xs text-neutral-500">
              <tr>
                <th className="px-5 py-2 font-medium">Sender</th>
                <th className="px-5 py-2 text-right font-medium">Emails</th>
                <th className="px-5 py-2 text-right font-medium">Unread</th>
              </tr>
            </thead>
            <tbody>
              {s.top_senders.length ? (
                s.top_senders.map((t) => (
                  <tr key={t.from_email} className="border-t border-neutral-100">
                    <td className="px-5 py-2">
                      <Link href={`/inbox?q=${encodeURIComponent(t.from_email)}`} className="block truncate hover:underline">
                        <span className="font-medium text-neutral-900">{t.from_name || t.from_email}</span>
                        {t.from_name ? <span className="ml-1 text-xs text-neutral-500">{t.from_email}</span> : null}
                      </Link>
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums">{t.total}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{t.unread}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-center text-xs text-neutral-500">
                    No data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card className="overflow-x-auto">
          <CardHeader title="Per mailbox" description="All time" />
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-xs text-neutral-500">
              <tr>
                <th className="px-5 py-2 font-medium">Mailbox</th>
                <th className="px-5 py-2 text-right font-medium">Emails</th>
                <th className="px-5 py-2 text-right font-medium">Unread</th>
              </tr>
            </thead>
            <tbody>
              {s.by_account.map((a) => (
                <tr key={a.account_id} className="border-t border-neutral-100">
                  <td className="px-5 py-2">
                    <span className="font-medium text-neutral-900">{a.email}</span>
                    <span className="ml-1 text-xs text-neutral-500">{providerLabel(a.provider)}</span>
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums">{a.emails}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{a.unread}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
