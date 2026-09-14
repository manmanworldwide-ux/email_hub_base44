"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, Plug2, Plus, Sparkles, Star, Trash2, XCircle } from "lucide-react";
import { api } from "@/lib/client-api";
import { Alert, Badge, Button, Card, CardHeader, Input, Label, Select } from "@/components/ui";
import { cn, formatRelative } from "@/lib/utils";
import type { ProviderInfo } from "@/lib/ai/llm";
import type { AiIntegrationPublic, LlmProvider } from "@/types/saas";

interface Platform {
  configured: boolean;
  allowed: boolean;
  model: string;
}

export function AiIntegrationsManager({ integrations, providers, platform }: { integrations: AiIntegrationPublic[]; providers: ProviderInfo[]; platform: Platform }) {
  const router = useRouter();
  const [adding, setAdding] = useState(integrations.length === 0);
  const [providerId, setProviderId] = useState<LlmProvider>("anthropic");
  const [model, setModel] = useState(providers[0]?.models[0]?.id ?? "");
  const [customModel, setCustomModel] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const provider = providers.find((p) => p.id === providerId)!;
  const defaultIntegration = integrations.find((i) => i.is_default && i.enabled) ?? integrations.find((i) => i.enabled);
  const activeSource = defaultIntegration ? `${providerName(defaultIntegration.provider, providers)} · ${defaultIntegration.model}` : platform.configured && platform.allowed ? `Platform AI · ${platform.model}` : null;

  function pickProvider(id: LlmProvider) {
    setProviderId(id);
    const info = providers.find((p) => p.id === id);
    const first = info?.models[0]?.id ?? "";
    setModel(first);
    setCustomModel(!first);
    setApiKey("");
    setBaseUrl("");
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/ai/integrations", {
        method: "POST",
        json: { provider: providerId, model, api_key: apiKey || null, base_url: baseUrl || null, label: label || undefined, make_default: true },
      });
      setAdding(false);
      setApiKey("");
      setLabel("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function test(id: string) {
    setRowBusy(id);
    try {
      const res = await api<{ ok: boolean; latency_ms?: number; model?: string; error?: string }>(`/api/v1/ai/integrations/${id}/test`, { method: "POST" });
      setTestResult((t) => ({ ...t, [id]: res.ok ? { ok: true, text: `Connected · ${res.latency_ms} ms · ${res.model}` } : { ok: false, text: res.error ?? "Failed" } }));
      router.refresh();
    } catch (err) {
      setTestResult((t) => ({ ...t, [id]: { ok: false, text: err instanceof Error ? err.message : "Failed" } }));
    } finally {
      setRowBusy(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setRowBusy(id);
    try {
      await api(`/api/v1/ai/integrations/${id}`, { method: "PATCH", json: body });
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setRowBusy(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Remove "${name}"?`)) return;
    setRowBusy(id);
    try {
      await api(`/api/v1/ai/integrations/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4", activeSource ? "border-green-200 bg-green-50/60" : "border-amber-200 bg-amber-50/60")}>
        <div className="flex items-center gap-3">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", activeSource ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">{activeSource ? "AI is ready" : "AI is not configured yet"}</p>
            <p className="text-xs text-neutral-600">
              {activeSource ? `Analysis and the assistant currently use ${activeSource}.` : "Add your own provider key below" + (platform.configured && !platform.allowed ? " (platform AI is disabled by your administrator)." : ".")}
            </p>
          </div>
        </div>
        {!adding ? (
          <Button onClick={() => setAdding(true)} size="sm">
            <Plus className="h-3.5 w-3.5" /> Add provider
          </Button>
        ) : null}
      </div>

      {adding ? (
        <Card>
          <CardHeader title="Add an AI provider" description="Your key is encrypted at rest and only used for your own requests." action={integrations.length ? <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button> : undefined} />
          <form onSubmit={onAdd} className="space-y-5 px-5 py-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProvider(p.id)}
                  className={cn(
                    "rounded-xl border p-3.5 text-left transition-all",
                    providerId === p.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-neutral-200 bg-white hover:border-neutral-300",
                  )}
                >
                  <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                    <Plug2 className="h-4 w-4 text-neutral-400" /> {p.label}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">{p.description}</p>
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="ai-model">Model</Label>
                {provider.models.length && !customModel ? (
                  <Select
                    id="ai-model"
                    value={model}
                    onChange={(e) => {
                      if (e.target.value === "__custom") {
                        setCustomModel(true);
                        setModel("");
                      } else setModel(e.target.value);
                    }}
                  >
                    {provider.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                    <option value="__custom">Custom model id…</option>
                  </Select>
                ) : (
                  <Input id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder={providerId === "openai_compatible" ? "e.g. llama-3.3-70b" : "model id"} required />
                )}
              </div>
              <div>
                <Label htmlFor="ai-key">API key {provider.needsApiKey ? "" : "(optional)"}</Label>
                <Input id="ai-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={provider.keyPlaceholder} required={provider.needsApiKey} autoComplete="off" />
                {provider.docsUrl ? (
                  <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-700 hover:underline">
                    Where do I get a key? <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
              {provider.needsBaseUrl ? (
                <div className="sm:col-span-2">
                  <Label htmlFor="ai-base">Base URL</Label>
                  <Input id="ai-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.groq.com/openai/v1" required />
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <Label htmlFor="ai-label">Label (optional)</Label>
                <Input id="ai-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`${provider.label} · ${model || "model"}`} />
              </div>
            </div>
            {error ? <Alert tone="critical">{error}</Alert> : null}
            <Button type="submit" disabled={busy || !model}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save and use this provider
            </Button>
          </form>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Your providers" description="The default provider is used for analysis and the assistant." />
        {integrations.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">No providers added yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {integrations.map((i) => {
              const result = testResult[i.id];
              return (
                <li key={i.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-900">
                      {i.label}
                      {i.is_default ? <Badge tone="brand">default</Badge> : null}
                      {!i.enabled ? <Badge>disabled</Badge> : null}
                      {i.last_test_ok === true ? <Badge tone="good">verified</Badge> : i.last_test_ok === false ? <Badge tone="critical">failing</Badge> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {providerName(i.provider, providers)} · {i.model}
                      {i.key_hint ? ` · key ${i.key_hint}` : ""}
                      {i.base_url ? ` · ${i.base_url}` : ""}
                      {i.last_tested_at ? ` · tested ${formatRelative(i.last_tested_at)}` : ""}
                    </p>
                    {result ? (
                      <p className={cn("mt-1 flex items-center gap-1 text-xs", result.ok ? "text-green-700" : "text-red-600")}>
                        {result.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} {result.text}
                      </p>
                    ) : i.last_error ? (
                      <p className="mt-1 text-xs text-red-600">{i.last_error}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button variant="secondary" size="sm" disabled={rowBusy === i.id} onClick={() => test(i.id)}>
                      {rowBusy === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Test
                    </Button>
                    {!i.is_default ? (
                      <Button variant="ghost" size="sm" disabled={rowBusy === i.id} onClick={() => patch(i.id, { make_default: true })}>
                        <Star className="h-3.5 w-3.5" /> Make default
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" disabled={rowBusy === i.id} onClick={() => patch(i.id, { enabled: !i.enabled })}>
                      {i.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={rowBusy === i.id} onClick={() => remove(i.id, i.label)} className="text-red-600 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Platform AI" description="Provided by the workspace when you have no provider of your own." />
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
          {platform.configured && platform.allowed ? (
            <>
              <Badge tone="good">available</Badge>
              <span className="text-neutral-700">Anthropic · {platform.model}. Used automatically when none of your providers is enabled.</span>
            </>
          ) : platform.configured ? (
            <>
              <Badge>disabled by admin</Badge>
              <span className="text-neutral-600">Add your own provider above to use AI features.</span>
            </>
          ) : (
            <>
              <Badge>not configured</Badge>
              <span className="text-neutral-600">The workspace has no platform key. Add your own provider above.</span>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function providerName(id: string, providers: ProviderInfo[]): string {
  return providers.find((p) => p.id === id)?.label ?? id;
}
