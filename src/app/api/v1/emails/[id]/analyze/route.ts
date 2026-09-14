import { ok, parseBody, withAuth } from "@/lib/api/response";
import { analyzeEmailSchema } from "@/lib/api/schemas";
import { analyzeEmail } from "@/lib/ai/analyze";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withAuth("ai:use", async (request, auth, params) => {
  const hasBody = request.headers.get("content-length") && request.headers.get("content-length") !== "0";
  const body = hasBody ? await parseBody(request, analyzeEmailSchema) : undefined;
  return ok(await analyzeEmail(auth.db, auth.userId, params.id, { force: body?.force }));
});
