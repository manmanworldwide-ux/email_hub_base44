import { ok, withAuth } from "@/lib/api/response";
import { deleteEvent } from "@/lib/hub/calendar";

export const dynamic = "force-dynamic";

export const DELETE = withAuth("calendar:write", async (_request, auth, params) => {
  await deleteEvent(auth.db, auth.userId, params.id);
  return ok({ id: params.id, deleted: true });
});
