import { ok, withAuth } from "@/lib/api/response";
import { getConversationMessages } from "@/lib/ai/assistant";

export const dynamic = "force-dynamic";

export const GET = withAuth("ai:use", async (_request, auth, params) => {
  return ok(await getConversationMessages(auth.db, auth.userId, params.id));
});
