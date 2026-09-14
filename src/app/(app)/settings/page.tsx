import { requireSession } from "@/lib/auth/session";
import { ChangePasswordForm, ProfileForm, RestartTourButton } from "@/components/profile-forms";
import { Badge, Card, CardHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Profile" };

export default async function ProfileSettingsPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const sp = await searchParams;
  const { user } = await requireSession();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Profile" description="How you appear in the hub." />
          <div className="px-5 py-4">
            <ProfileForm fullName={user.fullName} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Password" description="Use at least 8 characters." />
          <div className="px-5 py-4">
            <ChangePasswordForm highlight={sp.reset === "1"} />
          </div>
        </Card>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Account" />
          <dl className="grid grid-cols-[90px_1fr] gap-y-2 px-5 py-4 text-xs">
            <dt className="text-neutral-500">Email</dt>
            <dd className="truncate text-neutral-800">{user.email}</dd>
            <dt className="text-neutral-500">Role</dt>
            <dd>
              <Badge tone={user.role === "admin" ? "violet" : "neutral"}>{user.role}</Badge>
            </dd>
            <dt className="text-neutral-500">API tokens</dt>
            <dd>
              <Badge tone={user.role === "admin" || user.canCreateApiKeys ? "good" : "neutral"}>{user.role === "admin" || user.canCreateApiKeys ? "enabled" : "disabled"}</Badge>
            </dd>
            <dt className="text-neutral-500">Member since</dt>
            <dd className="text-neutral-800">{formatDateTime(user.createdAt)}</dd>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Product tour" description="Lost? Walk through the hub again." />
          <div className="px-5 py-4">
            <RestartTourButton />
          </div>
        </Card>
      </div>
    </div>
  );
}
