import { PageHeader } from "@/components/ui";
import { SubNav } from "@/components/sub-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Your profile, the AI that powers your hub, and access for external agents." />
      <SubNav
        items={[
          { href: "/settings", label: "Profile", exact: true },
          { href: "/settings/ai", label: "AI provider" },
          { href: "/settings/api", label: "API access" },
        ]}
      />
      {children}
    </>
  );
}
