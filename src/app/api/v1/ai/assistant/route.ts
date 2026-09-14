import { ok, parseBody, withAuth } from "@/lib/api/response";
import { assistantSchema } from "@/lib/api/schemas";
import { runAssistant } from "@/lib/ai/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withAuth("ai:use", async (request, auth) => {
  const body = await parseBody(request, assistantSchema);
  const result = await runAssistant(auth.db, auth.userId, {
    message: body.message,
    conversationId: body.conversation_id,
    timezone: body.timezone,
    source: auth.method === "api_key" ? `api_key:${auth.apiKeyName ?? auth.apiKeyId}` : "ui",
  });
  return ok(result);
});
