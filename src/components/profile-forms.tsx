"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlayCircle } from "lucide-react";
import { api } from "@/lib/client-api";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Input, Label } from "@/components/ui";
import { startTour } from "@/components/tour";

export function ProfileForm({ fullName }: { fullName: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(fullName ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "critical"; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/v1/me", { method: "PATCH", json: { full_name: name } });
      setMsg({ tone: "good", text: "Profile saved." });
      router.refresh();
    } catch (err) {
      setMsg({ tone: "critical", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="full-name">Full name</Label>
        <Input id="full-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
      </div>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
      </Button>
    </form>
  );
}

export function ChangePasswordForm({ highlight }: { highlight?: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "critical"; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMsg({ tone: "critical", text: "Passwords do not match." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) setMsg({ tone: "critical", text: error.message });
    else {
      setMsg({ tone: "good", text: "Password updated." });
      setPassword("");
      setConfirm("");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {highlight ? <Alert tone="good">You are signed in via a reset link. Set your new password below.</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <div>
          <Label htmlFor="confirm-password">Confirm</Label>
          <Input id="confirm-password" type="password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
      </div>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Update password
      </Button>
    </form>
  );
}

export function RestartTourButton() {
  return (
    <Button type="button" variant="secondary" onClick={startTour}>
      <PlayCircle className="h-4 w-4" /> Replay the product tour
    </Button>
  );
}
