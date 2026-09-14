import { ok, withErrors } from "@/lib/api/response";
import { validateInvitationToken } from "@/lib/auth/invitations";

export const dynamic = "force-dynamic";

/** Public: tells the invite page whether a link is still valid (never exposes the hash). */
export const GET = withErrors(async (_request, params) => {
  const invitation = await validateInvitationToken(params.token);
  if (!invitation) return ok({ valid: false });
  return ok({ valid: true, kind: invitation.kind, email: invitation.email, role: invitation.role, expires_at: invitation.expires_at });
});
