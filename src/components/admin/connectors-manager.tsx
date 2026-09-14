"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/client-api";
import { Alert, Badge, Button, Card, CardHeader, Input, Label, Toggle } from "@/components/ui";
import { ConnectProviderButton } from "@/components/connect-mailbox";
import { ProviderMark } from "@/components/provider-marks";
import { formatRelative } from "@/lib/utils";
import type { ConnectorStatus } from "@/lib/providers/credentials";

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-neutral-900 px-2.5 py-1.5 font-mono text-[11px] text-neutral-100">{value}</code>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

const GUIDES: Record<"google" | "microsoft", { console: string; consoleLabel: string; steps: (redirect: string, appUrl: string) => string[] }> = {
  google: {
    console: "https://console.cloud.google.com/apis/credentials",
    consoleLabel: "Google Cloud Console → Credentials",
    steps: (redirect, appUrl) => [
      "Create (or pick) a Google Cloud project and enable the Gmail API and Google Calendar API under APIs & Services → Library.",
      "APIs & Services → OAuth consent screen: choose Internal if your users are all in your Google Workspace organisation (no verification needed), otherwise External. Add the scopes gmail.modify and calendar. While an External app is in Testing, add each user's Gmail address as a test user.",
      `Credentials → Create credentials → OAuth client ID → Web application. Add ${appUrl} as an authorised JavaScript origin and this exact redirect URI: ${redirect}`,
      "Copy the Client ID and Client secret into the form below and save. Users can connect Gmail immediately - no redeploy needed.",
    ],
  },
  microsoft: {
    console: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
    consoleLabel: "Azure Portal → App registrations",
    steps: (redirect) => [
      "New registration. Name it (e.g. Email Hub). Supported account types: “Accounts in any organizational directory and personal Microsoft accounts” so both work and personal Outlook accounts can connect.",
      `Redirect URI: platform Web, value: ${redirect}`,
      "Certificates & secrets → New client secret. Copy the secret Value (not the Secret ID) right away - it is shown once.",
      "API permissions → Add → Microsoft Graph → Delegated: openid, profile, email, offline_access, User.Read, Mail.ReadWrite, Mail.Send, Calendars.ReadWrite. Users consent themselves when connecting; work tenants may require an admin to grant consent once.",
      "Overview → copy the Application (client) ID into the form below. Tenant: keep “common” for any account type, or set your tenant ID to restrict to your organisation.",
    ],
  },
};

function ConnectorCard({ connector, appUrl }: { connector: ConnectorStatus; appUrl: string }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(connector.source === "app" ? connector.client_id ?? "" : "");
  const [secret, setSecret] = useState("");
  const [tenant, setTenant] = useState(connector.tenant ?? "common");
  const [enabled, setEnabled] = useState(connector.source === "app" ? connector.enabled : true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "critical"; text: string } | null>(null);
  const [showGuide, setShowGuide] = useState(!connector.configured);
  const guide = GUIDES[connector.provider];

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/v1/admin/connectors", {
        method: "PUT",
        json: { provider: connector.provider, client_id: clientId, client_secret: secret || null, tenant: connector.provider === "microsoft" ? tenant : null, enabled },
      });
      setSecret("");
      setMsg({ tone: "good", text: "Saved. Users can connect this provider now." });
      router.refresh();
    } catch (err) {
      setMsg({ tone: "critical", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!window.confirm(`Remove the stored ${connector.label} client? Existing connected mailboxes will stop refreshing tokens until new credentials are saved.`)) return;
    setBusy(true);
    try {
      await api(`/api/v1/admin/connectors/${connector.provider}`, { method: "DELETE" });
      setClientId("");
      setSecret("");
      router.refresh();
    } catch (err) {
      setMsg({ tone: "critical", text: err instanceof Error ? err.message : "Failed to remove" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ProviderMark provider={connector.provider} className="h-5 w-5" /> {connector.label}
          </span>
        }
        description={
          connector.configured
            ? `Configured ${connector.source === "app" ? "in-app" : "via environment variables"}${connector.updated_at ? ` · updated ${formatRelative(connector.updated_at)}` : ""}`
            : "Not configured - users cannot connect this provider yet"
        }
        action={connector.configured ? <Badge tone="good">{connector.enabled ? "ready" : "disabled"}</Badge> : <Badge tone="warning">needs setup</Badge>}
      />

      <div className="space-y-5 px-5 py-5">
        <div>
          <Label>Redirect URI to register with {connector.provider === "google" ? "Google" : "Microsoft"}</Label>
          <CopyField value={connector.redirect_uri} />
        </div>

        <div className="rounded-xl border border-neutral-200 bg-neutral-50">
          <button type="button" onClick={() => setShowGuide((s) => !s)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-medium text-neutral-800">
            One-time setup guide {showGuide ? "▾" : "▸"}
          </button>
          {showGuide ? (
            <div className="border-t border-neutral-200 px-4 py-3">
              <a href={guide.console} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                Open {guide.consoleLabel} <ExternalLink className="h-3 w-3" />
              </a>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-5 text-neutral-600">
                {guide.steps(connector.redirect_uri, appUrl).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>

        <form onSubmit={onSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={connector.provider === "microsoft" ? "" : "sm:col-span-2"}>
              <Label htmlFor={`${connector.provider}-client-id`}>{connector.provider === "google" ? "Client ID" : "Application (client) ID"}</Label>
              <Input
                id={`${connector.provider}-client-id`}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={connector.provider === "google" ? "1234567890-abc.apps.googleusercontent.com" : "12345678-1234-1234-1234-123456789abc"}
                required
                autoComplete="off"
              />
            </div>
            {connector.provider === "microsoft" ? (
              <div>
                <Label htmlFor="ms-tenant">Tenant</Label>
                <Input id="ms-tenant" value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="common" />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Label htmlFor={`${connector.provider}-secret`}>Client secret {connector.source === "app" ? "(leave blank to keep the saved one)" : ""}</Label>
              <Input id={`${connector.provider}-secret`} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={connector.source === "app" ? "••••••••••••" : "Paste the client secret"} autoComplete="new-password" required={connector.source !== "app"} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-neutral-700">
              <Toggle checked={enabled} onChange={setEnabled} /> Enabled for users
            </label>
            <div className="flex items-center gap-2">
              {connector.source === "app" ? (
                <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={busy} className="text-red-600 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              ) : null}
              <Button type="submit" disabled={busy || !clientId}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </Button>
            </div>
          </div>
          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
        </form>

        {connector.configured ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3">
            <p className="text-xs text-neutral-600">Test it: connect one of your own {connector.provider === "google" ? "Gmail" : "Outlook"} accounts through the popup flow.</p>
            <ConnectProviderButton provider={connector.provider} configured size="sm" variant="secondary">
              Try connecting
            </ConnectProviderButton>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function ConnectorsManager({ connectors, appUrl }: { connectors: ConnectorStatus[]; appUrl: string }) {
  return (
    <div className="space-y-6">
      <Alert tone="neutral">
        Google and Microsoft require every application to be registered once by its operator. After that one-time step, every user simply clicks <strong>Add mailbox</strong>, signs in to their own account in a popup and approves access - no consoles involved. Credentials saved here are encrypted and take effect immediately, overriding any environment variables.
      </Alert>
      <div className="grid gap-6 xl:grid-cols-2">
        {connectors.map((c) => (
          <ConnectorCard key={c.provider} connector={c} appUrl={appUrl} />
        ))}
      </div>
    </div>
  );
}
