import { z } from "zod";
import { requireScope } from "@/lib/api/auth";
import { ok, parseQuery, withAuth } from "@/lib/api/response";
import { listUpcomingEvents, refreshCalendars } from "@/lib/hub/calendar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  within_minutes: z.coerce.number().int().min(1).max(1440).default(60),
  refresh: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .transform((v) => v === true || v === "true" || v === "1")
    .optional(),
  include_in_progress: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .transform((v) => v === true || v === "true" || v === "1")
    .optional(),
  account_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * "What starts in the next N minutes?" - built for reminder automations. With refresh=true the
 * calendars are re-pulled from Google/Microsoft first (calendar only, a few seconds) so events
 * created outside Email Hub are included.
 */
export const GET = withAuth("calendar:read", async (request, auth) => {
  const q = parseQuery(request, querySchema);
  let refreshed = undefined;
  if (q.refresh) {
    requireScope(auth, "sync:trigger");
    refreshed = await refreshCalendars(auth.db, auth.userId, { accountId: q.account_id });
  }
  const result = await listUpcomingEvents(auth.db, auth.userId, {
    withinMinutes: q.within_minutes,
    accountId: q.account_id,
    limit: q.limit,
    includeInProgress: q.include_in_progress ?? true,
  });
  return ok({ ...result, count: result.events.length, within_minutes: q.within_minutes, refreshed });
});
