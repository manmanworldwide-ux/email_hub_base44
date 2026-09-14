import { ok, parseQuery, withAuth } from "@/lib/api/response";
import { analyticsQuerySchema } from "@/lib/api/schemas";
import { getAnalyticsSummary } from "@/lib/hub/analytics";

export const dynamic = "force-dynamic";

export const GET = withAuth("analytics:read", async (request, auth) => {
  const { days } = parseQuery(request, analyticsQuerySchema);
  return ok(await getAnalyticsSummary(auth.db, auth.userId, days));
});
