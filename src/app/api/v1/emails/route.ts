import { ok, parseQuery, withAuth } from "@/lib/api/response";
import { listEmailsQuerySchema } from "@/lib/api/schemas";
import { listEmails } from "@/lib/hub/emails";

export const dynamic = "force-dynamic";

export const GET = withAuth("emails:read", async (request, auth) => {
  const q = parseQuery(request, listEmailsQuerySchema);
  const result = await listEmails(auth.db, auth.userId, {
    accountId: q.account_id,
    q: q.q,
    from: q.from,
    unread: q.unread,
    starred: q.starred,
    folder: q.folder,
    category: q.category,
    priority: q.priority,
    requiresResponse: q.requires_response,
    threadId: q.thread_id,
    since: q.since,
    until: q.until,
    limit: q.limit,
    offset: q.offset,
  });
  return ok(result.items, { total: result.total, limit: result.limit, offset: result.offset });
});
