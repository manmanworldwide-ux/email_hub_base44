import { ok, withAuth } from "@/lib/api/response";
import { listAccounts } from "@/lib/hub/accounts";

export const dynamic = "force-dynamic";

export const GET = withAuth("accounts:read", async (_request, auth) => {
  return ok(await listAccounts(auth.db, auth.userId));
});
