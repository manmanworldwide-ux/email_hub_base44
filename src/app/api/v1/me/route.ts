import { requireInteractive } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { ok, parseBody, withAuth } from "@/lib/api/response";
import { updateMeSchema } from "@/lib/api/schemas";

export const dynamic = "force-dynamic";

export const GET = withAuth("accounts:read", async (_request, auth) => {
  return ok({
    user_id: auth.userId,
    email: auth.email ?? auth.profile?.email ?? null,
    full_name: auth.profile?.full_name ?? null,
    role: auth.role,
    status: auth.status,
    can_create_api_keys: auth.role === "admin" || auth.canCreateApiKeys,
    tour_completed_at: auth.profile?.tour_completed_at ?? null,
    onboarding: auth.profile?.onboarding ?? {},
    auth_method: auth.method,
    scopes: auth.scopes,
    api_key: auth.apiKeyId ? { id: auth.apiKeyId, name: auth.apiKeyName } : null,
  });
});

export const PATCH = withAuth(null, async (request, auth) => {
  requireInteractive(auth);
  const body = await parseBody(request, updateMeSchema);
  const patch: Record<string, unknown> = {};
  if (body.full_name !== undefined) patch.full_name = body.full_name?.trim() || null;
  if (body.tour_completed !== undefined) patch.tour_completed_at = body.tour_completed ? new Date().toISOString() : null;
  if (body.onboarding) patch.onboarding = { ...(auth.profile?.onboarding ?? {}), ...body.onboarding };
  if (!Object.keys(patch).length) return ok(auth.profile);

  const { data, error } = await auth.db.from("profiles").update(patch).eq("id", auth.userId).select("*").single();
  if (error) throw new ApiError(500, error.message);
  return ok(data);
});
