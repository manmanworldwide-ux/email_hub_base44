import { requireInteractive } from "@/lib/api/auth";
import { ok, withAuth } from "@/lib/api/response";
import { revokeApiKey } from "@/lib/api/keys";

export const dynamic = "force-dynamic";

export const DELETE = withAuth(null, async (_request, auth, params) => {
  requireInteractive(auth);
  return ok(await revokeApiKey(auth.db, auth.userId, params.id));
});
