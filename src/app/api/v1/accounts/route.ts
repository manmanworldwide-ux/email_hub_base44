import { ok, withAuth } from "@/lib/api/response";
import { listAccounts } from "@/lib/hub/accounts";

export const dynamic = "force-dynamic";

export const GET = withAuth("accounts:read", async (_request, auth) => {
  const accounts = await listAccounts(auth.db, auth.userId);
  return ok(accounts, {
    total: accounts.length,
    by_provider: accounts.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.provider]: (acc[a.provider] ?? 0) + 1 }), {}),
  });
});
