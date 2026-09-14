"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Copy, ExternalLink, Link2, Loader2, UserPlus } from "lucide-react";
import { api } from "@/lib/client-api";
import { Alert, Badge, Button, Card, CardHeader, Input, Label, Select, Toggle } from "@/components/ui";
import { formatRelative } from "@/lib/utils";
import type { InvitationPublic } from "@/types/saas";

const STATUS_TONE = { pending: "brand", accepted: "good", revoked: "neutral", expired: "warning" } as const;

export function InvitationsManager({ invitations, defaultExpiryDays, defaultApiKeys }: { invitations: InvitationPublic[]; defaultExpiryDays: number; defaultApiKeys: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [apiKeys, setApiKeys] = useState(defaultApiKeys);
  const [expiry, setExpiry] = useState(String(defaultExpiryDays));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; url: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<InvitationPublic & { url: string }>("/api/v1/admin/invitations", {
        method: "POST",
        json: { email, role, can_create_api_keys: apiKeys, expires_in_days: Number(expiry), note: note || null },
      });
      setCreated({ email: res.email, url: res.url, expires_at: res.expires_at });
      setCopied(false);
      setEmail("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(inv: InvitationPublic) {
    if (!window.confirm(`Revoke the invitation for ${inv.email}?`)) return;
    setRowBusy(inv.id);
    try {
      await api(`/api/v1/admin/invitations/${inv.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Invite someone" description="Generates a link you can send however you like - no email is sent by the hub." />
          <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
            <div>
              <Label htmlFor="inv-email">Email address</Label>
              <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="inv-role">Role</Label>
                <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
                  <option value="member">Member</option>
                  <option value="admin">Administrator</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="inv-expiry">Link valid for</Label>
                <Select id="inv-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                  {[1, 3, 7, 14, 30].map((d) => (
                    <option key={d} value={d}>
                      {d} day{d === 1 ? "" : "s"}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <label className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2.5 text-xs">
              <span>
                <span className="block font-medium text-neutral-900">Allow API token generation</span>
                <span className="text-neutral-500">Lets this user connect external AI agents</span>
              </span>
              <Toggle checked={apiKeys} onChange={setApiKeys} />
            </label>
            <div>
              <Label htmlFor="inv-note">Note (internal, optional)</Label>
              <Input id="inv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Sales team" />
            </div>
            {error ? <Alert tone="critical">{error}</Alert> : null}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Generate invite link
            </Button>
          </form>
        </Card>

        {created ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-green-900">
              <Link2 className="h-4 w-4" /> Invite link for {created.email}
            </p>
            <p className="mt-1 text-xs text-green-800">Copy it now - it cannot be shown again. Expires {new Date(created.expires_at).toLocaleDateString()}.</p>
            <code className="mt-2 block overflow-x-auto rounded bg-white px-2 py-1.5 font-mono text-[11px] text-neutral-900">{created.url}</code>
            <div className="mt-2 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(created.url);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy link"}
              </Button>
              <a href={created.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs text-neutral-700 hover:bg-white">
                <ExternalLink className="h-3.5 w-3.5" /> Preview
              </a>
            </div>
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader title="Invitation history" description="Pending links can be revoked. Password-reset links generated from the Users page appear here too." />
        {invitations.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-500">No invitations yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-900">
                    {inv.email}
                    <Badge tone={STATUS_TONE[inv.status]}>{inv.status}</Badge>
                    {inv.kind === "reset" ? <Badge tone="violet">password reset</Badge> : <Badge>{inv.role}</Badge>}
                    {inv.kind === "invite" && inv.can_create_api_keys ? <Badge tone="good">API tokens</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    <span className="font-mono">{inv.token_prefix}…</span> · created {formatRelative(inv.created_at)}
                    {inv.status === "pending" ? ` · expires ${new Date(inv.expires_at).toLocaleDateString()}` : ""}
                    {inv.accepted_at ? ` · accepted ${formatRelative(inv.accepted_at)}` : ""}
                    {inv.note ? ` · ${inv.note}` : ""}
                  </p>
                </div>
                {inv.status === "pending" ? (
                  <Button variant="ghost" size="sm" disabled={rowBusy === inv.id} onClick={() => revoke(inv)} className="text-red-600 hover:bg-red-50">
                    {rowBusy === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
