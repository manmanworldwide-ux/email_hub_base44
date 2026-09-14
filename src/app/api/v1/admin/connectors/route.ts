import { requireAdmin } from "@/lib/api/auth";
import { ok, parseBody, withAuth } from "@/lib/api/response";
import { connectorSchema } from "@/lib/api/schemas";
import { upsertConnector } from "@/lib/auth/connectors";
import { getAllConnectorStatus } from "@/lib/providers/credentials";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const GET = withAuth(null, async (_request, auth) => {
  requireAdmin(auth);
  const status = await getAllConnectorStatus();
  return ok({ app_url: env.appUrl, connectors: [status.google, status.microsoft] });
});

export const PUT = withAuth(null, async (request, auth) => {
  requireAdmin(auth);
  const body = await parseBody(request, connectorSchema);
  return ok(
    await upsertConnector(auth.db, auth.userId, {
      provider: body.provider,
      clientId: body.client_id,
      clientSecret: body.client_secret ?? null,
      tenant: body.tenant ?? null,
      enabled: body.enabled,
    }),
  );
});
