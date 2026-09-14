"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, SendHorizonal, User, Wrench } from "lucide-react";
import { api } from "@/lib/client-api";
import { Button, Textarea } from "@/components/ui";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools?: { name: string; ok: boolean }[];
}

interface AssistantResponse {
  conversation_id: string;
  reply: string;
  tool_calls: { name: string; ok: boolean; error?: string }[];
}

const SUGGESTIONS = [
  "Summarise my unread emails from today",
  "Which emails need a reply? Draft responses for the top two.",
  "What meetings do I have this week?",
  "Find the latest invoice email and tell me the amount and due date",
  "Schedule a 30 minute call with the sender of my most urgent email tomorrow at 10am",
];

export function AssistantChat({
  conversationId,
  initialMessages,
  aiConfigured,
}: {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [convId, setConvId] = useState<string | null>(conversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", text: trimmed }]);
    try {
      const res = await api<AssistantResponse>("/api/v1/ai/assistant", {
        method: "POST",
        json: {
          message: trimmed,
          conversation_id: convId ?? undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: "assistant", text: res.reply, tools: res.tool_calls.map((t) => ({ name: t.name, ok: t.ok })) },
      ]);
      if (!convId) {
        setConvId(res.conversation_id);
        window.history.replaceState(null, "", `/assistant?c=${res.conversation_id}`);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The assistant failed to respond");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <div className="flex h-[calc(100dvh-14.5rem)] flex-col rounded-xl border border-neutral-200 bg-white lg:h-[calc(100vh-11rem)]">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-lg py-10 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Bot className="h-5 w-5" />
            </span>
            <h2 className="mt-3 text-sm font-semibold text-neutral-900">Ask anything about your inboxes</h2>
            <p className="mt-1 text-xs text-neutral-500">
              The assistant can search and read email across all connected accounts, draft and send replies, and schedule meetings.
            </p>
            <div className="mt-5 grid gap-2 text-left">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" ? (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Bot className="h-4 w-4" />
              </span>
            ) : null}
            <div className={`max-w-[75%] ${m.role === "user" ? "order-1" : ""}`}>
              <div
                className={`prose-chat whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                  m.role === "user" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900"
                }`}
              >
                {m.text}
              </div>
              {m.tools && m.tools.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.tools.map((t, i) => (
                    <span key={`${t.name}-${i}`} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${t.ok ? "bg-neutral-100 text-neutral-600" : "bg-red-50 text-red-700"}`}>
                      <Wrench className="h-2.5 w-2.5" /> {t.name.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {m.role === "user" ? (
              <span className="order-2 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-700">
                <User className="h-4 w-4" />
              </span>
            ) : null}
          </div>
        ))}

        {busy ? (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…
          </div>
        ) : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="border-t border-neutral-100 p-3">
        {!aiConfigured ? (
          <p className="mb-2 text-xs text-amber-700">ANTHROPIC_API_KEY is not set. The assistant is disabled until it is configured.</p>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder="Ask about your email, or tell me what to send or schedule… (Enter to send, Shift+Enter for a new line)"
            disabled={busy || !aiConfigured}
            className="resize-none"
          />
          <Button type="submit" disabled={busy || !input.trim() || !aiConfigured} className="h-[58px]">
            <SendHorizonal className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
