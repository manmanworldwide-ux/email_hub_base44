import { requireAdmin } from "@/lib/api/auth";
import { ok, withAuth } from "@/lib/api/response";
import { listUsers } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

export const GET = withAuth(null, async (_request, auth) => {
  requireAdmin(auth);
  return ok(await listUsers(auth.db));
});
