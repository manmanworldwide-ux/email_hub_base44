import { requireInteractive } from "@/lib/api/auth";
import { ok, withAuth } from "@/lib/api/response";
import { testIntegration } from "@/lib/ai/integrations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withAuth(null, async (_request, auth, params) => {
  requireInteractive(auth);
  return ok(await testIntegration(auth.db, auth.userId, params.id));
});
