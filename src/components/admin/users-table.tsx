"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Link2, Loader2, Trash2, UserPlus, UserX, UserCheck } from "lucide-react";
import { api } from "@/lib/client-api";
import { Badge, Button, Card, CardHeader, LinkButton, Toggle } from "@/components/ui";
import { cn, formatRelative, initials } from "@/lib/utils";
import type { AdminUserSummary } from "@/types/saas";

export function UsersTable({ users, currentUserId }: { users: AdminUserSummary[]; currentUserId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("");

  const visible = users.filter((u) => !filter || u.email.toLowerCase().includes(filter.toLowerCase()) || (u.full_name ?? "").toLowerCase().includes(filter.toLowerCase()));

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      await api(`/api/v1/admin/users/${id}`, { method: "PATCH", json: body });
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function reset(u: AdminUserSummary) {
    setBusy(u.id);
    try {
      const res = await api<{ url: string; email: string }>(`/api/v1/admin/users/${u.id}/reset-link`, { method: "POST" });
      setResetLink({ email: res.email, url: res.url });
      setCopied(false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(u: AdminUserSummary) {
    if (!window.confirm(`Delete ${u.email}? All of their mailboxes, emails and keys will be removed permanently.`)) return;
    setBusy(u.id);
    try {
      await api(`/api/v1/admin/users/${u.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {resetLink ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-900">Password-reset link for {resetLink.email} (valid 2 days)</p>
          <p className="mt-1 text-xs text-green-800">No email was sent. Share this link with the user through a channel you trust.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-2 py-1.5 font-mono text-[11px] text-neutral-900">{resetLink.url}</code>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(resetLink.url);
                setCopied(true);
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setResetLink(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={`${users.length} user${users.length === 1 ? "" : "s"}`}
          description="Change roles, enable API tokens for AI agents, disable accounts or generate reset links."
          action={
            <div className="flex items-center gap-2">
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="h-8 w-36 rounded-md border border-neutral-300 px-2.5 text-xs focus:border-brand-500 focus:outline-none" />
              <LinkButton href="/admin/invitations" size="sm">
                <UserPlus className="h-3.5 w-3.5" /> Invite
              </LinkButton>
            </div>
          }
        />

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-5 py-2.5 font-medium">User</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 font-medium">API tokens</th>
                <th className="px-3 py-2.5 font-medium">Usage</th>
                <th className="px-3 py-2.5 font-medium">Last sign-in</th>
                <th className="px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <UserRow key={u.id} u={u} self={u.id === currentUserId} busy={busy === u.id} onPatch={patch} onReset={reset} onDelete={remove} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="divide-y divide-neutral-100 md:hidden">
          {visible.map((u) => (
            <li key={u.id} className="space-y-3 px-4 py-4">
              <div className="flex items-center gap-3">
                <Avatar u={u} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">{u.full_name || u.email}</p>
                  <p className="truncate text-xs text-neutral-500">{u.email}</p>
                </div>
                <StatusBadge u={u} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2">
                  <span className="text-neutral-600">Role</span>
                  <select value={u.role} disabled={busy === u.id || u.id === currentUserId} onChange={(e) => patch(u.id, { role: e.target.value })} className="bg-transparent text-right font-medium text-neutral-900">
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
                <label className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2">
                  <span className="text-neutral-600">API tokens</span>
                  <Toggle checked={u.role === "admin" || u.can_create_api_keys} disabled={busy === u.id || u.role === "admin"} onChange={(v) => patch(u.id, { can_create_api_keys: v })} />
                </label>
              </div>
              <p className="text-xs text-neutral-500">
                {u.accounts} mailboxes · {u.emails} emails · {u.api_keys} keys · signed in {formatRelative(u.last_sign_in_at)}
              </p>
              <RowActions u={u} self={u.id === currentUserId} busy={busy === u.id} onPatch={patch} onReset={reset} onDelete={remove} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

type Handlers = {
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
  onReset: (u: AdminUserSummary) => Promise<void>;
  onDelete: (u: AdminUserSummary) => Promise<void>;
};

function Avatar({ u }: { u: AdminUserSummary }) {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700">{initials(u.full_name ?? u.email)}</span>;
}

function StatusBadge({ u }: { u: AdminUserSummary }) {
  return u.status === "active" ? <Badge tone="good">active</Badge> : <Badge tone="critical">disabled</Badge>;
}

function RowActions({ u, self, busy, onPatch, onReset, onDelete }: { u: AdminUserSummary; self: boolean; busy: boolean } & Handlers) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => onReset(u)} title="Generate password reset link">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Reset link
      </Button>
      {!self ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => onPatch(u.id, { status: u.status === "active" ? "disabled" : "active" })}>
          {u.status === "active" ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />} {u.status === "active" ? "Disable" : "Enable"}
        </Button>
      ) : null}
      {!self ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDelete(u)} className="text-red-600 hover:bg-red-50" title="Delete user">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

function UserRow({ u, self, busy, onPatch, onReset, onDelete }: { u: AdminUserSummary; self: boolean; busy: boolean } & Handlers) {
  return (
    <tr className={cn("border-t border-neutral-100", busy && "opacity-60")}>
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <Avatar u={u} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-medium text-neutral-900">
              {u.full_name || u.email}
              {self ? <Badge>you</Badge> : null}
              <StatusBadge u={u} />
            </p>
            <p className="truncate text-xs text-neutral-500">{u.email}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <select
          value={u.role}
          disabled={busy || self}
          onChange={(e) => onPatch(u.id, { role: e.target.value })}
          className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs focus:border-brand-500 focus:outline-none disabled:bg-neutral-50"
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <Toggle checked={u.role === "admin" || u.can_create_api_keys} disabled={busy || u.role === "admin"} onChange={(v) => onPatch(u.id, { can_create_api_keys: v })} />
          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <KeyRound className="h-3 w-3" /> {u.api_keys}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-neutral-600">
        {u.accounts} mailbox{u.accounts === 1 ? "" : "es"} · {u.emails.toLocaleString()} emails
      </td>
      <td className="px-3 py-3 text-xs text-neutral-600">{u.last_sign_in_at ? formatRelative(u.last_sign_in_at) : "never"}</td>
      <td className="px-3 py-3">
        <RowActions u={u} self={self} busy={busy} onPatch={onPatch} onReset={onReset} onDelete={onDelete} />
      </td>
    </tr>
  );
}

