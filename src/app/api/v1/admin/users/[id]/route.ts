import { requireAdmin } from "@/lib/api/auth";
import { ok, parseBody, withAuth } from "@/lib/api/response";
import { adminUpdateUserSchema } from "@/lib/api/schemas";
import { deleteUser, updateUser } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

export const PATCH = withAuth(null, async (request, auth, params) => {
  requireAdmin(auth);
  const body = await parseBody(request, adminUpdateUserSchema);
  return ok(await updateUser(auth.db, auth.userId, params.id, body));
});

export const DELETE = withAuth(null, async (_request, auth, params) => {
  requireAdmin(auth);
  await deleteUser(auth.userId, params.id);
  return ok({ id: params.id, deleted: true });
});
