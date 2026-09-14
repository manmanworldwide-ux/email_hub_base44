import { MapPin, Users, Video } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { listAccounts } from "@/lib/hub/accounts";
import { listEvents } from "@/lib/hub/calendar";
import { CreateEventForm, DeleteEventButton } from "@/components/calendar-forms";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { providerLabel } from "@/lib/utils";

export const metadata = { title: "Calendar" };

function timeRange(start: string, end: string, allDay: boolean) {
  if (allDay) return "All day";
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${fmt(s)} – ${fmt(e)}`;
}

export default async function CalendarPage() {
  const { supabase, user } = await requireUser();
  const now = new Date();
  const to = new Date(now.getTime() + 30 * 86_400_000);
  const [accounts, events] = await Promise.all([
    listAccounts(supabase, user.id),
    listEvents(supabase, user.id, { from: now.toISOString(), to: to.toISOString(), limit: 300 }),
  ]);

  const groups = new Map<string, typeof events>();
  for (const ev of events) {
    const key = new Date(ev.start_at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    groups.set(key, [...(groups.get(key) ?? []), ev]);
  }

  return (
    <>
      <PageHeader title="Calendar" description="Next 30 days across every connected calendar. Meetings you schedule here invite attendees automatically." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Agenda" description={`${events.length} event${events.length === 1 ? "" : "s"}`} />
          {events.length === 0 ? (
            <EmptyState title="No upcoming events" description="Events sync together with your mail. Schedule a meeting on the right." />
          ) : (
            <div className="divide-y divide-neutral-100">
              {[...groups.entries()].map(([day, list]) => (
                <div key={day} className="px-5 py-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{day}</p>
                  <ul className="space-y-2">
                    {list.map((ev) => (
                      <li key={ev.id} className="flex items-start gap-3 rounded-lg border border-neutral-100 px-3 py-2.5">
                        <span className="w-28 shrink-0 text-xs tabular-nums text-neutral-600">{timeRange(ev.start_at, ev.end_at, ev.all_day)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                            <span className="truncate">{ev.title || "(untitled)"}</span>
                            {ev.account ? <Badge>{providerLabel(ev.account.provider)}</Badge> : null}
                            {ev.created_by_hub ? <Badge tone="brand">via hub</Badge> : null}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                            {ev.location ? (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {ev.location}
                              </span>
                            ) : null}
                            {ev.attendees?.length ? (
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3 w-3" /> {ev.attendees.length}
                              </span>
                            ) : null}
                            {ev.meeting_link ? (
                              <a href={ev.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                                <Video className="h-3 w-3" /> Join
                              </a>
                            ) : null}
                            {ev.web_link ? (
                              <a href={ev.web_link} target="_blank" rel="noreferrer" className="hover:underline">
                                Open
                              </a>
                            ) : null}
                          </p>
                        </div>
                        <DeleteEventButton eventId={ev.id} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Schedule a meeting" />
          <div className="px-5 py-4">
            <CreateEventForm accounts={accounts.filter((a) => a.status !== "disabled")} />
          </div>
        </Card>
      </div>
    </>
  );
}
