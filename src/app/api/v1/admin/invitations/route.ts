import { requireAdmin } from "@/lib/api/auth";
import { ok, parseBody, withAuth } from "@/lib/api/response";
import { createInvitationSchema } from "@/lib/api/schemas";
import { createInvitation, listInvitations } from "@/lib/auth/invitations";

export const dynamic = "force-dynamic";

export const GET = withAuth(null, async (_request, auth) => {
  requireAdmin(auth);
  return ok(await listInvitations(auth.db));
});

export const POST = withAuth(null, async (request, auth) => {
  requireAdmin(auth);
  const body = await parseBody(request, createInvitationSchema);
  const result = await createInvitation(auth.db, auth.userId, {
    kind: "invite",
    email: body.email,
    role: body.role,
    canCreateApiKeys: body.can_create_api_keys,
    expiresInDays: body.expires_in_days,
    note: body.note ?? null,
  });
  return ok({ ...result.invitation, url: result.url }, undefined, { status: 201 });
});
