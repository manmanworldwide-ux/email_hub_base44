import { ok, parseBody, withAuth } from "@/lib/api/response";
import { sendEmailSchema } from "@/lib/api/schemas";
import { toAddresses } from "@/lib/api/addresses";
import { sendEmail } from "@/lib/hub/emails";

export const dynamic = "force-dynamic";

export const POST = withAuth("emails:write", async (request, auth) => {
  const body = await parseBody(request, sendEmailSchema);
  const result = await sendEmail(auth.db, auth.userId, {
    accountId: body.account_id,
    to: toAddresses(body.to),
    cc: toAddresses(body.cc),
    bcc: toAddresses(body.bcc),
    subject: body.subject,
    bodyText: body.body_text ?? null,
    bodyHtml: body.body_html ?? null,
  });
  return ok(result, undefined, { status: 201 });
});
