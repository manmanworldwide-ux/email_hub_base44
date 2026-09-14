import { Suspense } from "react";
import { requireSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/auth/settings";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireSession();

  const [{ count }, settings] = await Promise.all([
    supabase
      .from("emails")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .eq("is_sent", false)
      .eq("is_draft", false),
    getAppSettings(supabase),
  ]);

  return (
    <Suspense fallback={null}>
      <AppShell user={user} unread={count ?? 0} appName={settings.app_name}>
        {children}
      </AppShell>
    </Suspense>
  );
}
