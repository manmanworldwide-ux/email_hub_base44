import { ok, withAuth } from "@/lib/api/response";
import { syncAccountById } from "@/lib/hub/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withAuth("sync:trigger", async (_request, auth, params) => {
  return ok(await syncAccountById(auth.db, auth.userId, params.id));
});
