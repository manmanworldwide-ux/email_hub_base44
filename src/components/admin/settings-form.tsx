"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { api } from "@/lib/client-api";
import { Alert, Badge, Button, Card, CardHeader, Input, Label, Toggle } from "@/components/ui";
import type { AppSettings } from "@/types/saas";

export function AdminSettingsForm({
  settings,
  platform,
  providers,
  cronConfigured,
}: {
  settings: AppSettings;
  platform: { configured: boolean; model: string };
  providers: { google: boolean; microsoft: boolean };
  cronConfigured: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    app_name: settings.app_name,
    allow_self_signup: settings.allow_self_signup,
    allow_platform_ai: settings.allow_platform_ai,
    default_can_create_api_keys: settings.default_can_create_api_keys,
    invitation_expiry_days: settings.invitation_expiry_days,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "critical"; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/v1/admin/settings", { method: "PATCH", json: form });
      setMsg({ tone: "good", text: "Settings saved." });
      router.refresh();
    } catch (err) {
      setMsg({ tone: "critical", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setBusy(false);
    }
  }

  const row = (title: string, description: string, control: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-sm font-medium text-neutral-900">{title}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
      </div>
      {control}
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Access" description="Who can join and what new members can do." />
          <div className="divide-y divide-neutral-100">
            <div className="px-5 py-4">
              <Label htmlFor="app-name">Workspace name</Label>
              <Input id="app-name" value={form.app_name} onChange={(e) => setForm({ ...form, app_name: e.target.value })} maxLength={60} className="max-w-sm" />
            </div>
            {row(
              "Allow self sign-up",
              "When off, new accounts can only be created through invitation links (enforced in the database).",
              <Toggle checked={form.allow_self_signup} onChange={(v) => setForm({ ...form, allow_self_signup: v })} />,
            )}
            {row(
              "New users may generate API tokens",
              "Default for people who sign up or are invited without an explicit choice. Tokens let users connect external AI agents.",
              <Toggle checked={form.default_can_create_api_keys} onChange={(v) => setForm({ ...form, default_can_create_api_keys: v })} />,
            )}
            <div className="px-5 py-4">
              <Label htmlFor="inv-days">Default invitation validity (days)</Label>
              <Input
                id="inv-days"
                type="number"
                min={1}
                max={90}
                value={form.invitation_expiry_days}
                onChange={(e) => setForm({ ...form, invitation_expiry_days: Number(e.target.value) || 7 })}
                className="max-w-[120px]"
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="AI" description="How users get AI features." />
          <div className="divide-y divide-neutral-100">
            {row(
              "Offer platform AI to users",
              platform.configured
                ? `Users without their own provider key will use the workspace's Anthropic key (${platform.model}). Turn off to require everyone to bring their own key.`
                : "ANTHROPIC_API_KEY is not set on the server, so users must add their own provider in Settings → AI.",
              <Toggle checked={form.allow_platform_ai} disabled={!platform.configured} onChange={(v) => setForm({ ...form, allow_platform_ai: v })} />,
            )}
          </div>
        </Card>

        {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Server configuration" description="Read from environment variables." />
          <dl className="space-y-3 px-5 py-4 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-neutral-600">Google OAuth (Gmail)</dt>
              <dd>{providers.google ? <Badge tone="good">configured</Badge> : <Badge tone="warning">missing</Badge>}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-neutral-600">Microsoft OAuth (Outlook)</dt>
              <dd>{providers.microsoft ? <Badge tone="good">configured</Badge> : <Badge tone="warning">missing</Badge>}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-neutral-600">Platform AI key</dt>
              <dd>{platform.configured ? <Badge tone="good">configured</Badge> : <Badge>not set</Badge>}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-neutral-600">Scheduled sync (CRON_SECRET)</dt>
              <dd>{cronConfigured ? <Badge tone="good">configured</Badge> : <Badge tone="warning">missing</Badge>}</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <CardHeader title="How invitations work" />
          <ol className="list-decimal space-y-1.5 px-5 py-4 pl-9 text-xs text-neutral-600">
            <li>Generate a link under Invitations (or a reset link from Users).</li>
            <li>Send it to the person any way you like - chat, SMS, in person.</li>
            <li>They open it, set a password and land in the hub with the tour running.</li>
          </ol>
        </Card>
      </div>
    </form>
  );
}
