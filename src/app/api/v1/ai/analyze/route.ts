import { ok, parseBody, withAuth } from "@/lib/api/response";
import { batchAnalyzeSchema } from "@/lib/api/schemas";
import { analyzeEmailIds, analyzeUnanalyzedEmails } from "@/lib/ai/analyze";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withAuth("ai:use", async (request, auth) => {
  const hasBody = request.headers.get("content-length") && request.headers.get("content-length") !== "0";
  const body = hasBody ? await parseBody(request, batchAnalyzeSchema) : {};
  if (body.email_ids?.length) {
    return ok(await analyzeEmailIds(auth.db, auth.userId, body.email_ids));
  }
  return ok(await analyzeUnanalyzedEmails(auth.db, auth.userId, { limit: body.limit, accountId: body.account_id }));
});
