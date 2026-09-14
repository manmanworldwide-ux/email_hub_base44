import { requireAdminSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/auth/settings";
import { providerAvailability } from "@/lib/providers/credentials";
import { AdminSettingsForm } from "@/components/admin/settings-form";
import { env } from "@/lib/env";

export const metadata = { title: "Workspace settings" };

export default async function AdminSettingsPage() {
  const { supabase } = await requireAdminSession();
  const [settings, providers] = await Promise.all([getAppSettings(supabase), providerAvailability()]);
  return (
    <AdminSettingsForm
      settings={settings}
      platform={{ configured: env.ai.configured, model: env.ai.model }}
      providers={providers}
      cronConfigured={Boolean(env.cronSecret)}
    />
  );
}
