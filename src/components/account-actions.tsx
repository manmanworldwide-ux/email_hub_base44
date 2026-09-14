"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Unplug } from "lucide-react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui";

interface SyncResult {
  emails_synced: number;
  events_synced: number;
  analyses_run: number;
  status: string;
  error?: string;
}

export function SyncAccountButton({ accountId, size = "sm" }: { accountId?: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNote(null);
    try {
      const results = accountId
        ? [await api<SyncResult>(`/api/v1/accounts/${accountId}/sync`, { method: "POST" })]
        : await api<SyncResult[]>("/api/v1/sync", { method: "POST" });
      const emails = results.reduce((s, r) => s + r.emails_synced, 0);
      const events = results.reduce((s, r) => s + r.events_synced, 0);
      const failed = results.filter((r) => r.status === "error");
      setNote(failed.length ? `Failed: ${failed[0].error ?? "unknown error"}` : `Synced ${emails} emails, ${events} events`);
      router.refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="secondary" size={size} onClick={run} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {accountId ? "Sync" : "Sync all"}
      </Button>
      {note ? <span className="text-xs text-neutral-500">{note}</span> : null}
    </span>
  );
}

export function DisconnectAccountButton({ accountId, email }: { accountId: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!window.confirm(`Disconnect ${email}? Synced emails and events for this mailbox will be removed from Email Hub.`)) return;
    setBusy(true);
    try {
      await api(`/api/v1/accounts/${accountId}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="ghost" size="sm" onClick={run} disabled={busy} className="text-red-600 hover:bg-red-50">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />} Disconnect
    </Button>
  );
}
