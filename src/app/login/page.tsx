import { Bot, CalendarCheck, Inbox, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { env } from "@/lib/env";
import { getAppSettings, hasAnyUsers } from "@/lib/auth/settings";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: Inbox, title: "One inbox, every account", body: "Gmail and Outlook side by side with unified search." },
  { icon: Bot, title: "AI that works your mail", body: "Priorities, summaries, drafted replies and an assistant that can act." },
  { icon: CalendarCheck, title: "Schedule in seconds", body: "Meetings with Meet or Teams links across all your calendars." },
  { icon: KeyRound, title: "Open to your agents", body: "Scoped access tokens let tools like Base44 read and act for you." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const configured = env.supabaseConfigured;
  const [firstUser, settings] = configured ? await Promise.all([hasAnyUsers().then((x) => !x), getAppSettings()]) : [false, null];
  const appName = settings?.app_name ?? "Email Hub";

  return (
    <div className="min-h-screen bg-neutral-950 text-white lg:grid lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[420px] w-[420px] rounded-full bg-violet-600/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 shadow-lg shadow-brand-900/50">
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <p className="text-lg font-semibold">{appName}</p>
            <p className="text-xs text-neutral-400">Unified inbox · AI inside</p>
          </div>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            All your mailboxes.
            <br />
            <span className="bg-gradient-to-r from-brand-300 to-violet-300 bg-clip-text text-transparent">One intelligent hub.</span>
          </h1>
          <ul className="mt-10 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                  <f.icon className="h-4 w-4 text-brand-300" />
                </span>
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-sm text-neutral-400">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-neutral-500">
          <ShieldCheck className="h-3.5 w-3.5" /> Tokens encrypted at rest · Row-level security · Invitation-only access
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10 lg:bg-neutral-900/60">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold">{appName}</p>
              <p className="text-xs text-neutral-400">Gmail + Outlook, one inbox, AI inside</p>
            </div>
          </div>
          {configured ? (
            <LoginForm next={params.next ?? "/dashboard"} initialError={params.error} allowSignup={firstUser || Boolean(settings?.allow_self_signup)} firstUser={firstUser} appName={appName} />
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-sm text-amber-100">
              <p className="font-semibold">Supabase is not configured</p>
              <p className="mt-2 text-amber-200/80">Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY, run the migrations, then reload.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
