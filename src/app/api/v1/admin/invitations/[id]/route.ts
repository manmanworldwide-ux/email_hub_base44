import { requireAdmin } from "@/lib/api/auth";
import { ok, withAuth } from "@/lib/api/response";
import { revokeInvitation } from "@/lib/auth/invitations";

export const dynamic = "force-dynamic";

export const DELETE = withAuth(null, async (_request, auth, params) => {
  requireAdmin(auth);
  return ok(await revokeInvitation(auth.db, params.id));
});
