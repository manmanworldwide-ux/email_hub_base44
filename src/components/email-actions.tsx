"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, MailOpen, Reply, ReplyAll, Sparkles, Star } from "lucide-react";
import { api } from "@/lib/client-api";
import { Alert, Button, Textarea } from "@/components/ui";
import type { EmailAnalysisRow } from "@/types";

export function MarkReadOnOpen({ emailId, isRead }: { emailId: string; isRead: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (isRead) return;
    api(`/api/v1/emails/${emailId}`, { method: "PATCH", json: { is_read: true } })
      .then(() => router.refresh())
      .catch(() => undefined);
  }, [emailId, isRead, router]);
  return null;
}

export function EmailToolbar({
  emailId,
  isRead,
  isStarred,
  webLink,
}: {
  emailId: string;
  isRead: boolean;
  isStarred: boolean;
  webLink: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(flags: { is_read?: boolean; is_starred?: boolean }, key: string) {
    setBusy(key);
    setError(null);
    try {
      await api(`/api/v1/emails/${emailId}`, { method: "PATCH", json: flags });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => patch({ is_starred: !isStarred }, "star")}>
        <Star className={`h-3.5 w-3.5 ${isStarred ? "fill-amber-400 text-amber-400" : ""}`} /> {isStarred ? "Unstar" : "Star"}
      </Button>
      <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => patch({ is_read: !isRead }, "read")}>
        <MailOpen className="h-3.5 w-3.5" /> Mark {isRead ? "unread" : "read"}
      </Button>
      {webLink ? (
        <a href={webLink} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-neutral-600 hover:bg-neutral-100">
          <ExternalLink className="h-3.5 w-3.5" /> Open in mailbox
        </a>
      ) : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

export function AnalyzeButton({ emailId, hasAnalysis }: { emailId: string; hasAnalysis: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await api<EmailAnalysisRow>(`/api/v1/emails/${emailId}/analyze`, { method: "POST", json: { force: hasAnalysis } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant={hasAnalysis ? "secondary" : "primary"} size="sm" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {hasAnalysis ? "Re-analyse" : "Analyse with AI"}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

export function ReplyForm({ emailId, suggestedReply }: { emailId: string; suggestedReply: string | null }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [replyAll, setReplyAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/emails/${emailId}/reply`, { method: "POST", json: { body_text: body, reply_all: replyAll } });
      setSent(true);
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Write your reply…" required />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !body.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : replyAll ? <ReplyAll className="h-4 w-4" /> : <Reply className="h-4 w-4" />}
          {replyAll ? "Reply all" : "Send reply"}
        </Button>
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          <input type="checkbox" checked={replyAll} onChange={(e) => setReplyAll(e.target.checked)} className="h-3.5 w-3.5" /> Reply to all
        </label>
        {suggestedReply ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setBody(suggestedReply)}>
            <Sparkles className="h-3.5 w-3.5" /> Use AI suggestion
          </Button>
        ) : null}
      </div>
      {error ? <Alert tone="critical">{error}</Alert> : null}
      {sent ? <Alert tone="good">Reply sent.</Alert> : null}
    </form>
  );
}

export function EmailBody({ text, html }: { text: string | null; html: string | null }) {
  const [mode, setMode] = useState<"text" | "html">(text ? "text" : html ? "html" : "text");
  if (!text && !html) return <p className="text-sm text-neutral-500">This message has no body.</p>;
  return (
    <div>
      {text && html ? (
        <div className="mb-3 flex gap-1 text-xs">
          <button type="button" onClick={() => setMode("text")} className={`rounded px-2 py-1 ${mode === "text" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
            Plain text
          </button>
          <button type="button" onClick={() => setMode("html")} className={`rounded px-2 py-1 ${mode === "html" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
            Original HTML
          </button>
        </div>
      ) : null}
      {mode === "html" && html ? (
        <iframe
          title="Email content"
          sandbox=""
          srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:14px;color:#0b0b0b;margin:0;padding:4px}img{max-width:100%}</style></head><body>${html}</body></html>`}
          className="h-[70vh] w-full rounded-md border border-neutral-200 bg-white"
        />
      ) : (
        <pre className="email-body whitespace-pre-wrap font-sans text-neutral-800">{text ?? ""}</pre>
      )}
    </div>
  );
}
