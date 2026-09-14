import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { listAccounts } from "@/lib/hub/accounts";
import { listEmails } from "@/lib/hub/emails";
import { EmailRow } from "@/components/email-row";
import { InboxFilters } from "@/components/inbox-filters";
import { SyncAccountButton } from "@/components/account-actions";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Inbox" };

const PAGE_SIZE = 50;

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const page = Math.max(1, Number(one(sp.page) ?? "1") || 1);

  const [accounts, result] = await Promise.all([
    listAccounts(supabase, user.id),
    listEmails(supabase, user.id, {
      accountId: one(sp.account) || undefined,
      q: one(sp.q) || undefined,
      unread: one(sp.unread) === "true" ? true : undefined,
      folder: one(sp.folder) || undefined,
      category: one(sp.category) || undefined,
      priority: one(sp.priority) || undefined,
      requiresResponse: one(sp.requires_response) === "true" ? true : undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = one(v);
      if (val && k !== "page") params.set(k, val);
    }
    params.set("page", String(p));
    return `/inbox?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Inbox"
        description={`${result.total.toLocaleString()} message${result.total === 1 ? "" : "s"}`}
        action={
          <div className="flex items-center gap-2">
            <SyncAccountButton size="md" />
            <LinkButton href="/compose" variant="secondary">
              Compose
            </LinkButton>
          </div>
        }
      />
      <Card>
        <InboxFilters accounts={accounts} />
        {result.items.length ? (
          result.items.map((e) => <EmailRow key={e.id} email={e} />)
        ) : (
          <EmptyState
            title="No emails match"
            description={accounts.length ? "Try clearing filters or syncing your accounts." : "Connect a mailbox to get started."}
            action={!accounts.length ? <LinkButton href="/accounts">Connect an account</LinkButton> : undefined}
          />
        )}
        {pages > 1 ? (
          <div className="flex items-center justify-between px-4 py-3 text-xs text-neutral-500">
            <span>
              Page {page} of {pages}
            </span>
            <span className="flex gap-3">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="font-medium text-brand-700 hover:underline">
                  ← Newer
                </Link>
              ) : null}
              {page < pages ? (
                <Link href={pageHref(page + 1)} className="font-medium text-brand-700 hover:underline">
                  Older →
                </Link>
              ) : null}
            </span>
          </div>
        ) : null}
      </Card>
    </>
  );
}
