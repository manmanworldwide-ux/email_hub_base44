import { ok, withAuth } from "@/lib/api/response";
import { PROVIDERS, platformAiStatus } from "@/lib/ai/llm";

export const dynamic = "force-dynamic";

export const GET = withAuth("ai:use", async (_request, auth) => {
  const platform = await platformAiStatus(auth.db);
  return ok({ providers: PROVIDERS, platform });
});
