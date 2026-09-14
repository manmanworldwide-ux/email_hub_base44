"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { api } from "@/lib/client-api";
import { Alert, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { providerLabel } from "@/lib/utils";
import type { AccountPublic } from "@/types";

function splitAddresses(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ComposeForm({ accounts, initialTo = "", initialSubject = "" }: { accounts: AccountPublic[]; initialTo?: string; initialSubject?: string }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api<{ from: string }>("/api/v1/emails/send", {
        method: "POST",
        json: {
          account_id: accountId,
          to: splitAddresses(to),
          cc: splitAddresses(cc),
          bcc: splitAddresses(bcc),
          subject,
          body_text: body,
        },
      });
      setSuccess(`Sent from ${result.from}.`);
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  if (!accounts.length) {
    return <Alert tone="warning">Connect a Gmail or Outlook account first to send email.</Alert>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="from">From</Label>
          <Select id="from" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name ? `${a.display_name} · ` : ""}
                {a.email} ({providerLabel(a.provider)})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="to">To</Label>
          <Input id="to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="jane@example.com, John <john@example.com>" required />
        </div>
        <div>
          <Label htmlFor="cc">Cc</Label>
          <Input id="cc" value={cc} onChange={(e) => setCc(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="bcc">Bcc</Label>
          <Input id="bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="body">Message</Label>
        <Textarea id="body" rows={12} value={body} onChange={(e) => setBody(e.target.value)} required />
      </div>
      {error ? <Alert tone="critical">{error}</Alert> : null}
      {success ? <Alert tone="good">{success}</Alert> : null}
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
      </Button>
    </form>
  );
}
