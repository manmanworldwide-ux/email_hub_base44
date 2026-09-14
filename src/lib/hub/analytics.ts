import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";

export interface AnalyticsSummary {
  period_days: number;
  generated_at: string;
  totals: {
    accounts: number;
    emails: number;
    emails_in_period: number;
    unread: number;
    sent_in_period: number;
    analyzed: number;
    requires_response: number;
    upcoming_events_7d: number;
  };
  by_category: { key: string; count: number }[];
  by_priority: { key: string; count: number }[];
  by_sentiment: { key: string; count: number }[];
  volume_by_day: { day: string; received: number; sent: number }[];
  top_senders: { from_email: string; from_name: string | null; total: number; unread: number }[];
  by_account: { account_id: string; email: string; provider: string; emails: number; unread: number }[];
}

type CountResult = { count: number | null; error: { message: string } | null };

async function count(query: PromiseLike<CountResult>): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return n ?? 0;
}

function tally(rows: Record<string, unknown>[], key: string): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = String(row[key] ?? "unknown");
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([k, c]) => ({ key: k, count: c })).sort((a, b) => b.count - a.count);
}

export async function getAnalyticsSummary(db: SupabaseClient, userId: string, days = 30): Promise<AnalyticsSummary> {
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
  const nowIso = new Date().toISOString();
  const in7d = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const head = { count: "exact" as const, head: true };

  const [
    accounts,
    emails,
    emailsInPeriod,
    unread,
    sentInPeriod,
    analyzed,
    requiresResponse,
    upcoming,
    analysisRows,
    volume,
    senders,
    accountRows,
    perAccountEmails,
  ] = await Promise.all([
    count(db.from("connected_accounts").select("id", head).eq("user_id", userId)),
    count(db.from("emails").select("id", head).eq("user_id", userId)),
    count(db.from("emails").select("id", head).eq("user_id", userId).gte("received_at", sinceIso)),
    count(db.from("emails").select("id", head).eq("user_id", userId).eq("is_read", false).eq("is_sent", false)),
    count(db.from("emails").select("id", head).eq("user_id", userId).eq("is_sent", true).gte("received_at", sinceIso)),
    count(db.from("email_analyses").select("id", head).eq("user_id", userId)),
    count(db.from("email_analyses").select("id", head).eq("user_id", userId).eq("requires_response", true)),
    count(db.from("calendar_events").select("id", head).eq("user_id", userId).gte("start_at", nowIso).lte("start_at", in7d)),
    db.from("email_analyses").select("category, priority, sentiment").eq("user_id", userId).gte("created_at", sinceIso).limit(5000),
    db.rpc("email_volume_by_day", { p_user_id: userId, p_days: days }),
    db.rpc("top_senders", { p_user_id: userId, p_days: days, p_limit: 10 }),
    db.from("connected_accounts").select("id, email, provider").eq("user_id", userId),
    db.from("emails").select("account_id, is_read").eq("user_id", userId).eq("is_sent", false).limit(20000),
  ]);

  if (analysisRows.error) throw new ApiError(500, analysisRows.error.message);
  if (volume.error) throw new ApiError(500, volume.error.message);
  if (senders.error) throw new ApiError(500, senders.error.message);

  const rows = (analysisRows.data ?? []) as Record<string, unknown>[];
  const accountList = (accountRows.data ?? []) as { id: string; email: string; provider: string }[];

  const perAccount = new Map<string, { emails: number; unread: number }>();
  for (const e of (perAccountEmails.data ?? []) as { account_id: string; is_read: boolean }[]) {
    const entry = perAccount.get(e.account_id) ?? { emails: 0, unread: 0 };
    entry.emails += 1;
    if (!e.is_read) entry.unread += 1;
    perAccount.set(e.account_id, entry);
  }

  type VolumeRow = { day: string; received: number | string; sent: number | string };
  type SenderRow = { from_email: string; from_name: string | null; total: number | string; unread: number | string };

  return {
    period_days: days,
    generated_at: nowIso,
    totals: {
      accounts,
      emails,
      emails_in_period: emailsInPeriod,
      unread,
      sent_in_period: sentInPeriod,
      analyzed,
      requires_response: requiresResponse,
      upcoming_events_7d: upcoming,
    },
    by_category: tally(rows, "category"),
    by_priority: tally(rows, "priority"),
    by_sentiment: tally(rows, "sentiment"),
    volume_by_day: ((volume.data ?? []) as VolumeRow[]).map((v) => ({
      day: v.day,
      received: Number(v.received),
      sent: Number(v.sent),
    })),
    top_senders: ((senders.data ?? []) as SenderRow[]).map((s) => ({
      from_email: s.from_email,
      from_name: s.from_name,
      total: Number(s.total),
      unread: Number(s.unread),
    })),
    by_account: accountList.map((a) => ({
      account_id: a.id,
      email: a.email,
      provider: a.provider,
      emails: perAccount.get(a.id)?.emails ?? 0,
      unread: perAccount.get(a.id)?.unread ?? 0,
    })),
  };
}
