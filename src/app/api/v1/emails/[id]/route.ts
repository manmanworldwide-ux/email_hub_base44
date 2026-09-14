import { ok, parseBody, withAuth } from "@/lib/api/response";
import { updateEmailSchema } from "@/lib/api/schemas";
import { getEmail, updateEmailFlags } from "@/lib/hub/emails";

export const dynamic = "force-dynamic";

export const GET = withAuth("emails:read", async (_request, auth, params) => {
  return ok(await getEmail(auth.db, auth.userId, params.id));
});

export const PATCH = withAuth("emails:write", async (request, auth, params) => {
  const body = await parseBody(request, updateEmailSchema);
  return ok(await updateEmailFlags(auth.db, auth.userId, params.id, body));
});
