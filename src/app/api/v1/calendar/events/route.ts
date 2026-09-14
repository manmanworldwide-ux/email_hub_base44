import { ok, parseBody, parseQuery, withAuth } from "@/lib/api/response";
import { createEventSchema, listEventsQuerySchema } from "@/lib/api/schemas";
import { toAddresses } from "@/lib/api/addresses";
import { createEvent, listEvents } from "@/lib/hub/calendar";

export const dynamic = "force-dynamic";

export const GET = withAuth("calendar:read", async (request, auth) => {
  const q = parseQuery(request, listEventsQuerySchema);
  return ok(await listEvents(auth.db, auth.userId, { accountId: q.account_id, from: q.from, to: q.to, limit: q.limit }));
});

export const POST = withAuth("calendar:write", async (request, auth) => {
  const body = await parseBody(request, createEventSchema);
  const event = await createEvent(auth.db, auth.userId, {
    accountId: body.account_id,
    title: body.title,
    description: body.description ?? null,
    location: body.location ?? null,
    start: body.start,
    end: body.end,
    timezone: body.timezone,
    attendees: toAddresses(body.attendees),
    onlineMeeting: body.online_meeting,
    allDay: body.all_day,
  });
  return ok(event, undefined, { status: 201 });
});
