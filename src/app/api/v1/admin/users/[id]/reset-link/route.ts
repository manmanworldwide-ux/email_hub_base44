import { requireAdmin } from "@/lib/api/auth";
import { ApiError, notFound } from "@/lib/api/errors";
import { ok, withAuth } from "@/lib/api/response";
import { createInvitation } from "@/lib/auth/invitations";
import type { ProfileRow } from "@/types/saas";

export const dynamic = "force-dynamic";

/** Generates a password-reset link for a user (no email is sent - the admin shares the link). */
export const POST = withAuth(null, async (_request, auth, params) => {
  requireAdmin(auth);
  const { data, error } = await auth.db.from("profiles").select("*").eq("id", params.id).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  const profile = data as ProfileRow | null;
  if (!profile?.email) throw notFound("User not found");
  const result = await createInvitation(auth.db, auth.userId, {
    kind: "reset",
    email: profile.email,
    role: profile.role,
    canCreateApiKeys: profile.can_create_api_keys,
    targetUserId: profile.id,
    expiresInDays: 2,
  });
  return ok({ url: result.url, expires_at: result.invitation.expires_at, email: profile.email }, undefined, { status: 201 });
});
