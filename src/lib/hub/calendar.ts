import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { getProvider } from "@/lib/providers";
import { getAccessToken, getAccountRow, listAccountRows } from "@/lib/hub/accounts";
import type { Address, CalendarEventRow, ConnectedAccountRow, NormalizedEvent } from "@/types";

export interface EventFilters {
  accountId?: string;
  from?: string;
  to?: string;
  limit: number;
}

export type CalendarEventWithAccount = CalendarEventRow & {
  account: { id: string; provider: string; email: string } | null;
};

export async function listEvents(db: SupabaseClient, userId: string, filters: EventFilters): Promise<CalendarEventWithAccount[]> {
  const from = filters.from ?? new Date().toISOString();
  const to = filters.to ?? new Date(Date.now() + 30 * 86_400_000).toISOString();

  let query = db
    .from("calendar_events")
    .select("*, account:connected_accounts(id, provider, email)")
    .eq("user_id", userId)
    .gte("end_at", from)
    .lte("start_at", to)
    .neq("status", "cancelled");
  if (filters.accountId) query = query.eq("account_id", filters.accountId);

  const { data, error } = await query.order("start_at", { ascending: true }).limit(filters.limit);
  if (error) throw new ApiError(500, error.message);
  return (data ?? []) as unknown as CalendarEventWithAccount[];
}

export interface CreateEventInput {
  accountId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: string;
  end: string;
  timezone?: string;
  attendees?: Address[];
  onlineMeeting?: boolean;
  allDay?: boolean;
}

export async function createEvent(db: SupabaseClient, userId: string, input: CreateEventInput): Promise<CalendarEventRow> {
  const start = new Date(input.start);
  const end = new Date(input.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw badRequest("start and end must be ISO 8601 dates");
  if (end <= start) throw badRequest("end must be after start");

  const account = await getAccountRow(db, userId, input.accountId);
  const provider = getProvider(account.provider);
  const token = await getAccessToken(db, account);

  const created = await provider.createEvent(token, {
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    start: start.toISOString(),
    end: end.toISOString(),
    timezone: input.timezone ?? "UTC",
    attendees: input.attendees ?? [],
    onlineMeeting: input.onlineMeeting ?? true,
    allDay: input.allDay ?? false,
  });

  return upsertEvent(db, account, created, true);
}

export async function upsertEvent(
  db: SupabaseClient,
  account: Pick<ConnectedAccountRow, "id" | "user_id">,
  event: NormalizedEvent,
  createdByHub = false,
): Promise<CalendarEventRow> {
  const { data, error } = await db
    .from("calendar_events")
    .upsert(
      { ...event, user_id: account.user_id, account_id: account.id, ...(createdByHub ? { created_by_hub: true } : {}) },
      { onConflict: "account_id,provider_event_id" },
    )
    .select("*")
    .single();
  if (error) throw new ApiError(500, error.message);
  return data as CalendarEventRow;
}

export async function deleteEvent(db: SupabaseClient, userId: string, eventId: string): Promise<void> {
  const { data, error } = await db
    .from("calendar_events")
    .select("*")
    .eq("user_id", userId)
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  const event = data as CalendarEventRow | null;
  if (!event) throw notFound("Event not found");

  const account = await getAccountRow(db, userId, event.account_id);
  const provider = getProvider(account.provider);
  const token = await getAccessToken(db, account);
  await provider.deleteEvent(token, event.provider_event_id);
  await db.from("calendar_events").delete().eq("id", event.id);
}

export interface CalendarRefreshResult {
  account_id: string;
  email: string;
  provider: string;
  status: "ok" | "error";
  events: number;
  error?: string;
}

/**
 * Calendar-only refresh for every active account (no mail sync), using a short window so it
 * completes in a few seconds. Used by the "upcoming events" endpoint that agents poll for reminders.
 */
export async function refreshCalendars(db: SupabaseClient, userId: string, options: { accountId?: string; daysAhead?: number } = {}): Promise<CalendarRefreshResult[]> {
  const accounts = (await listAccountRows(db, userId)).filter((a) => a.status !== "disabled" && (!options.accountId || a.id === options.accountId));
  const results: CalendarRefreshResult[] = [];
  await Promise.all(
    accounts.map(async (account) => {
      try {
        const token = await getAccessToken(db, account);
        const events = await syncCalendarForAccount(db, account, token, 1, options.daysAhead ?? 14);
        results.push({ account_id: account.id, email: account.email, provider: account.provider, status: "ok", events });
      } catch (error) {
        results.push({
          account_id: account.id,
          email: account.email,
          provider: account.provider,
          status: "error",
          events: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
  return results;
}

export type UpcomingEvent = CalendarEventWithAccount & { minutes_until_start: number; in_progress: boolean };

/** Events starting (or already running) within the next `withinMinutes`, soonest first. */
export async function listUpcomingEvents(
  db: SupabaseClient,
  userId: string,
  options: { withinMinutes: number; accountId?: string; limit?: number; includeInProgress?: boolean },
): Promise<{ now: string; window_end: string; events: UpcomingEvent[] }> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + options.withinMinutes * 60_000);
  const events = await listEvents(db, userId, {
    accountId: options.accountId,
    from: now.toISOString(),
    to: windowEnd.toISOString(),
    limit: options.limit ?? 50,
  });
  const upcoming = events
    .map((e) => {
      const start = new Date(e.start_at).getTime();
      return { ...e, minutes_until_start: Math.round((start - now.getTime()) / 60_000), in_progress: start <= now.getTime() };
    })
    .filter((e) => (options.includeInProgress ?? true) || !e.in_progress)
    .sort((a, b) => a.minutes_until_start - b.minutes_until_start);
  return { now: now.toISOString(), window_end: windowEnd.toISOString(), events: upcoming };
}

/** Pulls events for one account into the local store for the sync window. */
export async function syncCalendarForAccount(
  db: SupabaseClient,
  account: ConnectedAccountRow,
  accessToken: string,
  windowDaysBack = 7,
  windowDaysForward = 60,
): Promise<number> {
  const provider = getProvider(account.provider);
  const timeMin = new Date(Date.now() - windowDaysBack * 86_400_000);
  const timeMax = new Date(Date.now() + windowDaysForward * 86_400_000);
  const events = await provider.listEvents(accessToken, { timeMin, timeMax });

  if (events.length) {
    const rows = events.map((e) => ({ ...e, user_id: account.user_id, account_id: account.id }));
    const { error } = await db.from("calendar_events").upsert(rows, { onConflict: "account_id,provider_event_id" });
    if (error) throw new ApiError(500, `Failed to store events: ${error.message}`);
  }

  // Remove local events in the window that no longer exist upstream (deleted/moved).
  const keep = new Set(events.map((e) => e.provider_event_id));
  const { data: local } = await db
    .from("calendar_events")
    .select("id, provider_event_id")
    .eq("account_id", account.id)
    .gte("start_at", timeMin.toISOString())
    .lte("start_at", timeMax.toISOString());
  const stale = ((local ?? []) as { id: string; provider_event_id: string }[]).filter((e) => !keep.has(e.provider_event_id));
  if (stale.length) {
    await db.from("calendar_events").delete().in("id", stale.map((e) => e.id));
  }

  await db.from("connected_accounts").update({ last_calendar_synced_at: new Date().toISOString() }).eq("id", account.id);
  return events.length;
}
