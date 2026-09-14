import { requireUser } from "@/lib/supabase/server";
import { listAccounts } from "@/lib/hub/accounts";
import { ComposeForm } from "@/components/compose-form";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Compose" };

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ to?: string; subject?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const accounts = (await listAccounts(supabase, user.id)).filter((a) => a.status !== "disabled");

  return (
    <>
      <PageHeader title="Compose" description="Send from any connected Gmail or Outlook account." />
      <Card className="p-6">
        <ComposeForm accounts={accounts} initialTo={sp.to ?? ""} initialSubject={sp.subject ?? ""} />
      </Card>
    </>
  );
}
