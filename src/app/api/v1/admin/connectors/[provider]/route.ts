import { requireAdmin } from "@/lib/api/auth";
import { badRequest } from "@/lib/api/errors";
import { ok, withAuth } from "@/lib/api/response";
import { deleteConnector } from "@/lib/auth/connectors";
import { isProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";

export const DELETE = withAuth(null, async (_request, auth, params) => {
  requireAdmin(auth);
  if (!isProvider(params.provider)) throw badRequest("Unknown provider");
  return ok(await deleteConnector(auth.db, params.provider));
});
