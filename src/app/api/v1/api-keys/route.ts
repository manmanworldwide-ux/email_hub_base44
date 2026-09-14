import { requireApiKeyPermission, requireInteractive } from "@/lib/api/auth";
import { ok, parseBody, withAuth } from "@/lib/api/response";
import { createApiKeySchema } from "@/lib/api/schemas";
import { createApiKey, listApiKeys } from "@/lib/api/keys";

export const dynamic = "force-dynamic";

export const GET = withAuth(null, async (_request, auth) => {
  requireInteractive(auth);
  return ok(await listApiKeys(auth.db, auth.userId));
});

export const POST = withAuth(null, async (request, auth) => {
  requireApiKeyPermission(auth);
  const body = await parseBody(request, createApiKeySchema);
  const { key, token } = await createApiKey(auth.db, auth.userId, {
    name: body.name,
    scopes: body.scopes,
    expiresInDays: body.expires_in_days ?? null,
  });
  return ok({ ...key, token }, undefined, { status: 201 });
});
