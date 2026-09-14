import { ok, withAuth } from "@/lib/api/response";
import { disconnectAccount, getAccountPublic } from "@/lib/hub/accounts";

export const dynamic = "force-dynamic";

export const GET = withAuth("accounts:read", async (_request, auth, params) => {
  return ok(await getAccountPublic(auth.db, auth.userId, params.id));
});

export const DELETE = withAuth("accounts:write", async (_request, auth, params) => {
  await disconnectAccount(auth.db, auth.userId, params.id);
  return ok({ id: params.id, disconnected: true });
});
