import { ok, parseBody, withAuth } from "@/lib/api/response";
import { syncBodySchema } from "@/lib/api/schemas";
import { getAccountRow, listAccountRows } from "@/lib/hub/accounts";
import { syncAccount } from "@/lib/hub/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withAuth("sync:trigger", async (request, auth) => {
  const body = request.headers.get("content-length") && request.headers.get("content-length") !== "0"
    ? await parseBody(request, syncBodySchema)
    : undefined;

  const options = { calendar: body?.calendar, analyze: body?.analyze };
  if (body?.account_id) {
    const account = await getAccountRow(auth.db, auth.userId, body.account_id);
    return ok([await syncAccount(auth.db, account, options)]);
  }

  const accounts = (await listAccountRows(auth.db, auth.userId)).filter((a) => a.status !== "disabled");
  const results = [];
  for (const account of accounts) results.push(await syncAccount(auth.db, account, options));
  return ok(results);
});
