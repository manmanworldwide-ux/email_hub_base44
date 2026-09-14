import { ok, parseBody, withErrors } from "@/lib/api/response";
import { acceptInvitationSchema } from "@/lib/api/schemas";
import { acceptInvitation } from "@/lib/auth/invitations";

export const dynamic = "force-dynamic";

/** Public: sets the password for an invited (or reset) user. The client signs in afterwards. */
export const POST = withErrors(async (request) => {
  const body = await parseBody(request, acceptInvitationSchema);
  const result = await acceptInvitation({ token: body.token, password: body.password, fullName: body.full_name ?? null });
  return ok(result, undefined, { status: 201 });
});
