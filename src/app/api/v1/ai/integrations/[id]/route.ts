import { requireInteractive } from "@/lib/api/auth";
import { ok, parseBody, withAuth } from "@/lib/api/response";
import { updateIntegrationSchema } from "@/lib/api/schemas";
import { deleteIntegration, updateIntegration } from "@/lib/ai/integrations";

export const dynamic = "force-dynamic";

export const PATCH = withAuth(null, async (request, auth, params) => {
  requireInteractive(auth);
  const body = await parseBody(request, updateIntegrationSchema);
  return ok(
    await updateIntegration(auth.db, auth.userId, params.id, {
      label: body.label,
      model: body.model,
      apiKey: body.api_key ?? undefined,
      baseUrl: body.base_url,
      enabled: body.enabled,
      makeDefault: body.make_default,
    }),
  );
});

export const DELETE = withAuth(null, async (_request, auth, params) => {
  requireInteractive(auth);
  await deleteIntegration(auth.db, auth.userId, params.id);
  return ok({ id: params.id, deleted: true });
});
