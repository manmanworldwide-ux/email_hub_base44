import { requireAdminSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/auth/settings";
import { AdminSettingsForm } from "@/components/admin/settings-form";
import { env } from "@/lib/env";

export const metadata = { title: "Workspace settings" };

export default async function AdminSettingsPage() {
  const { supabase } = await requireAdminSession();
  const settings = await getAppSettings(supabase);
  return (
    <AdminSettingsForm
      settings={settings}
      platform={{ configured: env.ai.configured, model: env.ai.model }}
      providers={{ google: env.google.configured, microsoft: env.microsoft.configured }}
      cronConfigured={Boolean(env.cronSecret)}
    />
  );
}
