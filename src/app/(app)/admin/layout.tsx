import { requireAdminSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { SubNav } from "@/components/sub-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSession();
  return (
    <>
      <PageHeader title="Administration" description="Manage who can use the hub, invite people with a link, and control workspace-wide options." />
      <SubNav
        items={[
          { href: "/admin/users", label: "Users" },
          { href: "/admin/invitations", label: "Invitations" },
          { href: "/admin/connectors", label: "Mail connectors" },
          { href: "/admin/settings", label: "Workspace settings" },
        ]}
      />
      {children}
    </>
  );
}
