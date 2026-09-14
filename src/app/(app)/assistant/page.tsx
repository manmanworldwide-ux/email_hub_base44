import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getConversationMessages, listConversations } from "@/lib/ai/assistant";
import { AssistantChat, type ChatMessage } from "@/components/assistant-chat";
import { PageHeader } from "@/components/ui";
import { cn, formatRelative } from "@/lib/utils";
import { env } from "@/lib/env";

export const metadata = { title: "AI Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const { supabase, user } = await requireUser();
  const conversations = await listConversations(supabase, user.id);

  let initialMessages: ChatMessage[] = [];
  let conversationId: string | null = null;
  if (c) {
    try {
      const { conversation, messages } = await getConversationMessages(supabase, user.id, c);
      conversationId = conversation.id;
      initialMessages = messages.map((m) => ({ id: m.id, role: m.role, text: m.display_text ?? "" }));
    } catch {
      conversationId = null;
    }
  }

  return (
    <>
      <PageHeader title="AI Assistant" description="Search, summarise, reply and schedule across every connected mailbox." />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <Link
            href="/assistant"
            className="mb-3 flex items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" /> New conversation
          </Link>
          <ul className="space-y-1">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <Link
                  href={`/assistant?c=${conv.id}`}
                  className={cn(
                    "block rounded-md px-3 py-2 text-xs hover:bg-white",
                    conv.id === conversationId ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-600",
                  )}
                >
                  <span className="block truncate">{conv.title || "Untitled conversation"}</span>
                  <span className="block text-[10px] text-neutral-400">
                    {formatRelative(conv.updated_at)}
                    {conv.source !== "ui" ? ` · ${conv.source}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <AssistantChat key={conversationId ?? "new"} conversationId={conversationId} initialMessages={initialMessages} aiConfigured={env.ai.configured} />
      </div>
    </>
  );
}
