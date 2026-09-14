import { requireAdminSession } from "@/lib/auth/session";
import { listInvitations } from "@/lib/auth/invitations";
import { getAppSettings } from "@/lib/auth/settings";
import { InvitationsManager } from "@/components/admin/invitations-manager";

export const metadata = { title: "Invitations" };

export default async function AdminInvitationsPage() {
  const { supabase } = await requireAdminSession();
  const [invitations, settings] = await Promise.all([listInvitations(supabase), getAppSettings(supabase)]);
  return <InvitationsManager invitations={invitations} defaultExpiryDays={settings.invitation_expiry_days} defaultApiKeys={settings.default_can_create_api_keys} />;
}
