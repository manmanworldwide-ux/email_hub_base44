import Link from "next/link";
import { Mail, ShieldAlert } from "lucide-react";
import { validateInvitationToken } from "@/lib/auth/invitations";
import { getAppSettings } from "@/lib/auth/settings";
import { AcceptInviteForm } from "@/components/accept-invite-form";
import { env } from "@/lib/env";

export const metadata = { title: "Accept invitation" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = env.supabaseConfigured ? await validateInvitationToken(token) : null;
  const settings = env.supabaseConfigured ? await getAppSettings() : null;
  const appName = settings?.app_name ?? "Email Hub";

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 shadow-lg shadow-brand-900/50">
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <p className="text-lg font-semibold">{appName}</p>
            <p className="text-xs text-neutral-400">Unified inbox · AI inside</p>
          </div>
        </div>

        {invitation ? (
          <AcceptInviteForm token={token} email={invitation.email} kind={invitation.kind} role={invitation.role} appName={appName} />
        ) : (
          <div className="rounded-3xl border border-white/10 bg-neutral-900/80 p-8 text-center shadow-2xl">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <h1 className="mt-4 text-lg font-semibold">This link is not valid</h1>
            <p className="mt-2 text-sm text-neutral-400">It may have expired, been used already, or been revoked. Ask your administrator for a new link.</p>
            <Link href="/login" className="mt-6 inline-flex h-10 items-center rounded-xl bg-white/10 px-4 text-sm font-medium hover:bg-white/15">
              Go to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
