import { ok, parseBody, withAuth } from "@/lib/api/response";
import { replyEmailSchema } from "@/lib/api/schemas";
import { replyToEmail } from "@/lib/hub/emails";

export const dynamic = "force-dynamic";

export const POST = withAuth("emails:write", async (request, auth, params) => {
  const body = await parseBody(request, replyEmailSchema);
  const result = await replyToEmail(auth.db, auth.userId, params.id, {
    bodyText: body.body_text ?? null,
    bodyHtml: body.body_html ?? null,
    replyAll: body.reply_all,
  });
  return ok(result, undefined, { status: 201 });
});
