"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, ShieldOff } from "lucide-react";
import { api } from "@/lib/client-api";
import { Alert, Badge, Button, Input, Label, Select } from "@/components/ui";
import { formatRelative } from "@/lib/utils";
import type { ApiKeyPublic } from "@/types";

export function ApiKeysManager({ keys, scopes }: { keys: ApiKeyPublic[]; scopes: { scope: string; description: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("Base44 superagent");
  const [selected, setSelected] = useState<string[]>(scopes.map((s) => s.scope));
  const [expiry, setExpiry] = useState<string>("365");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function toggle(scope: string) {
    setSelected((s) => (s.includes(scope) ? s.filter((x) => x !== scope) : [...s, scope]));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<ApiKeyPublic & { token: string }>("/api/v1/api-keys", {
        method: "POST",
        json: { name, scopes: selected, expires_in_days: expiry === "never" ? null : Number(expiry) },
      });
      setCreated({ token: res.token, name: res.name });
      setCopied(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string, keyName: string) {
    if (!window.confirm(`Revoke "${keyName}"? Integrations using it will stop working immediately.`)) return;
    try {
      await api(`/api/v1/api-keys/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to revoke");
    }
  }

  async function copy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.token);
    setCopied(true);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <form onSubmit={onCreate} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <KeyRound className="h-4 w-4" /> Generate access token
        </h3>
        <div>
          <Label htmlFor="key-name">Name</Label>
          <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Base44 superagent" />
        </div>
        <div>
          <Label>Scopes</Label>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {scopes.map((s) => (
              <label key={s.scope} className="flex items-start gap-2 rounded-md border border-neutral-200 px-2.5 py-2 text-xs">
                <input type="checkbox" checked={selected.includes(s.scope)} onChange={() => toggle(s.scope)} className="mt-0.5 h-3.5 w-3.5" />
                <span>
                  <span className="font-mono text-[11px] text-neutral-900">{s.scope}</span>
                  <span className="block text-neutral-500">{s.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="key-expiry">Expires</Label>
          <Select id="key-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In 1 year</option>
            <option value="never">Never</option>
          </Select>
        </div>
        {error ? <Alert tone="critical">{error}</Alert> : null}
        <Button type="submit" disabled={busy || !selected.length}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Create key
        </Button>

        {created ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-xs font-medium text-green-900">Key “{created.name}” created. Copy it now - it will not be shown again.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-white px-2 py-1.5 font-mono text-[11px] text-neutral-900">{created.token}</code>
              <Button type="button" variant="secondary" size="sm" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : null}
      </form>

      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-neutral-900">Existing keys</h3>
          <p className="text-xs text-neutral-500">Only a hash is stored. Revoking is immediate.</p>
        </div>
        {keys.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">No API keys yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {keys.map((k) => {
              const revoked = Boolean(k.revoked_at);
              const expired = k.expires_at ? new Date(k.expires_at).getTime() < Date.now() : false;
              return (
                <li key={k.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                      {k.name}
                      {revoked ? <Badge tone="critical">revoked</Badge> : expired ? <Badge tone="warning">expired</Badge> : <Badge tone="good">active</Badge>}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-neutral-500">{k.key_prefix}…</p>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Created {formatRelative(k.created_at)} · Last used {k.last_used_at ? formatRelative(k.last_used_at) : "never"}
                      {k.expires_at ? ` · Expires ${new Date(k.expires_at).toLocaleDateString()}` : ""}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <span key={s} className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600">
                          {s}
                        </span>
                      ))}
                    </p>
                  </div>
                  {!revoked ? (
                    <Button variant="ghost" size="sm" onClick={() => revoke(k.id, k.name)} className="text-red-600 hover:bg-red-50">
                      <ShieldOff className="h-3.5 w-3.5" /> Revoke
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
