import { ok, withAuth } from "@/lib/api/response";
import { listConversations } from "@/lib/ai/assistant";

export const dynamic = "force-dynamic";

export const GET = withAuth("ai:use", async (_request, auth) => {
  return ok(await listConversations(auth.db, auth.userId));
});
