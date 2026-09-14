"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "magic" | "forgot";

const ERRORS: Record<string, string> = {
  disabled: "Your account has been disabled. Contact your administrator.",
  auth_callback_failed: "That sign-in link is invalid or has expired.",
  session_mismatch: "Please sign in again to continue.",
};

function friendlyError(message: string): string {
  if (/database error saving new user|SIGNUP_DISABLED/i.test(message)) {
    return "Sign-ups are by invitation only. Ask your administrator for an invite link.";
  }
  if (/invalid login credentials/i.test(message)) return "Incorrect email or password.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email address first.";
  if (/user is banned|banned/i.test(message)) return "Your account has been disabled. Contact your administrator.";
  return message;
}

const inputClass =
  "h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-white placeholder:text-neutral-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

export function LoginForm({
  next,
  initialError,
  allowSignup,
  firstUser,
  appName,
}: {
  next: string;
  initialError?: string;
  allowSignup: boolean;
  firstUser: boolean;
  appName: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(firstUser ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ? ERRORS[initialError] ?? "Something went wrong. Please try again." : null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const origin = window.location.origin;

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`, data: { full_name: fullName } },
        });
        if (error) throw error;
        if (data.session) {
          router.push(firstUser ? "/dashboard?tour=1" : next);
          router.refresh();
        } else {
          setNotice("Check your inbox to confirm your email, then sign in.");
        }
      } else if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: allowSignup },
        });
        if (error) throw error;
        setNotice("Magic link sent - check your inbox.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/settings?reset=1")}` });
        if (error) throw error;
        setNotice("If that address has an account, a reset link is on its way. No email? Ask your administrator for a reset link instead.");
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  const tabs: [Mode, string][] = [["signin", "Sign in"], ...(allowSignup ? ([["signup", firstUser ? "Create admin" : "Create account"]] as [Mode, string][]) : []), ["magic", "Magic link"]];

  return (
    <div className="rounded-3xl border border-white/10 bg-neutral-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
      {firstUser ? (
        <div className="mb-5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-xs text-brand-100">
          <p className="font-semibold">Welcome! You are setting up {appName}.</p>
          <p className="mt-1 text-brand-200/80">The first account created becomes the administrator. You can then invite your team with links.</p>
        </div>
      ) : null}

      {mode !== "forgot" ? (
        <div className={cn("mb-6 grid rounded-xl bg-white/5 p-1 text-xs font-medium", tabs.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {tabs.map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setNotice(null);
              }}
              className={cn("rounded-lg py-2 transition-colors", mode === m ? "bg-white text-neutral-900 shadow" : "text-neutral-400 hover:text-white")}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Reset your password</h2>
          <p className="mt-1 text-xs text-neutral-400">We will email you a link if the address exists. Administrators can also generate a reset link for you.</p>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "signup" ? (
          <div>
            <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-neutral-300">
              Full name
            </label>
            <input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" className={inputClass} />
          </div>
        ) : null}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-neutral-300">
            Email
          </label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={inputClass} />
        </div>
        {mode === "signin" || mode === "signup" ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="text-xs font-medium text-neutral-300">
                Password
              </label>
              {mode === "signin" ? (
                <button type="button" onClick={() => setMode("forgot")} className="text-xs text-brand-300 hover:underline">
                  Forgot password?
                </button>
              ) : null}
            </div>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={inputClass}
            />
          </div>
        ) : null}

        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200">{error}</p> : null}
        {notice ? <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3.5 py-2.5 text-sm text-green-200">{notice}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:bg-brand-800 disabled:text-neutral-300"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "signin" ? "Sign in" : mode === "signup" ? (firstUser ? "Create administrator account" : "Create account") : mode === "magic" ? "Send magic link" : "Send reset link"}
        </button>

        {mode === "forgot" ? (
          <button type="button" onClick={() => setMode("signin")} className="w-full text-center text-xs text-neutral-400 hover:text-white">
            Back to sign in
          </button>
        ) : null}
      </form>

      {!allowSignup && mode === "signin" ? (
        <p className="mt-6 text-center text-[11px] leading-5 text-neutral-500">Access is by invitation. Received an invite link? Open it to set your password.</p>
      ) : null}
    </div>
  );
}
