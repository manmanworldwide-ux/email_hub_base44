"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-white placeholder:text-neutral-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

export function AcceptInviteForm({ token, email, kind, role, appName }: { token: string; email: string; kind: "invite" | "reset"; role: string; appName: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, full_name: kind === "invite" ? fullName || null : null }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload?.error?.message ?? "Could not set your password");

      const { error: signInError } = await createClient().auth.signInWithPassword({ email, password });
      if (signInError) {
        setDone(true);
        setError("Your password was saved but automatic sign-in failed. Please sign in manually.");
        return;
      }
      setDone(true);
      router.push(kind === "invite" ? "/dashboard?tour=1" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-neutral-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
      <h1 className="text-lg font-semibold">{kind === "invite" ? `You're invited to ${appName}` : "Set a new password"}</h1>
      <p className="mt-1 text-sm text-neutral-400">
        {kind === "invite" ? (
          <>
            Create a password for <span className="text-white">{email}</span>
            {role === "admin" ? " (administrator)" : ""} to get started.
          </>
        ) : (
          <>
            Choose a new password for <span className="text-white">{email}</span>.
          </>
        )}
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {kind === "invite" ? (
          <div>
            <label htmlFor="inv-name" className="mb-1.5 block text-xs font-medium text-neutral-300">
              Your name
            </label>
            <input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" className={inputClass} autoComplete="name" />
          </div>
        ) : null}
        <div>
          <label htmlFor="inv-email" className="mb-1.5 block text-xs font-medium text-neutral-300">
            Email
          </label>
          <input id="inv-email" value={email} readOnly className={`${inputClass} text-neutral-400`} />
        </div>
        <div>
          <label htmlFor="inv-password" className="mb-1.5 block text-xs font-medium text-neutral-300">
            Password
          </label>
          <input id="inv-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className={inputClass} />
        </div>
        <div>
          <label htmlFor="inv-confirm" className="mb-1.5 block text-xs font-medium text-neutral-300">
            Confirm password
          </label>
          <input id="inv-confirm" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </div>

        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200">{error}</p> : null}
        {done && !error ? (
          <p className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-3.5 py-2.5 text-sm text-green-200">
            <CheckCircle2 className="h-4 w-4" /> Password saved. Signing you in…
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || done}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:bg-brand-800 disabled:text-neutral-300"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {kind === "invite" ? "Create my account" : "Save new password"}
        </button>
      </form>
    </div>
  );
}
