import { requireAdmin } from "@/lib/api/auth";
import { ok, parseBody, withAuth } from "@/lib/api/response";
import { adminSettingsSchema } from "@/lib/api/schemas";
import { getAppSettings, updateAppSettings } from "@/lib/auth/settings";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const GET = withAuth(null, async (_request, auth) => {
  requireAdmin(auth);
  const settings = await getAppSettings(auth.db);
  return ok({ ...settings, platform_ai_configured: env.ai.configured, platform_ai_model: env.ai.model });
});

export const PATCH = withAuth(null, async (request, auth) => {
  requireAdmin(auth);
  const body = await parseBody(request, adminSettingsSchema);
  return ok(await updateAppSettings(auth.db, auth.userId, body));
});
