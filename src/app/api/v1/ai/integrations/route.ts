import { requireInteractive } from "@/lib/api/auth";
import { ok, parseBody, withAuth } from "@/lib/api/response";
import { createIntegrationSchema } from "@/lib/api/schemas";
import { createIntegration, listIntegrations } from "@/lib/ai/integrations";

export const dynamic = "force-dynamic";

export const GET = withAuth(null, async (_request, auth) => {
  requireInteractive(auth);
  return ok(await listIntegrations(auth.db, auth.userId));
});

export const POST = withAuth(null, async (request, auth) => {
  requireInteractive(auth);
  const body = await parseBody(request, createIntegrationSchema);
  const created = await createIntegration(auth.db, auth.userId, {
    provider: body.provider,
    label: body.label,
    model: body.model,
    apiKey: body.api_key ?? null,
    baseUrl: body.base_url ?? null,
    makeDefault: body.make_default,
  });
  return ok(created, undefined, { status: 201 });
});
