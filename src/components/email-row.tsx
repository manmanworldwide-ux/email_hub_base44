import Link from "next/link";
import { Paperclip, Star } from "lucide-react";
import { Badge, priorityTone } from "@/components/ui";
import { cn, formatEmailDate, providerLabel, truncate } from "@/lib/utils";
import type { EmailListItem } from "@/types";

export function EmailRow({ email, showAccount = true }: { email: EmailListItem; showAccount?: boolean }) {
  const unread = !email.is_read && !email.is_sent;
  const sender = email.is_sent
    ? `To: ${email.to_recipients?.map((a) => a.name || a.email).join(", ") || "—"}`
    : email.from_name || email.from_email || "Unknown sender";

  return (
    <Link
      href={`/inbox/${email.id}`}
      className={cn(
        "block border-b border-neutral-100 px-4 py-3 text-sm transition-colors hover:bg-neutral-50",
        "sm:grid sm:grid-cols-[14px_minmax(140px,180px)_1fr_auto] sm:items-center sm:gap-3 sm:py-2.5",
        unread && "bg-brand-50/40",
      )}
    >
      {/* indicator */}
      <span className="hidden items-center justify-center sm:flex">
        {email.is_starred ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> : unread ? <span className="h-2 w-2 rounded-full bg-brand-500" /> : null}
      </span>

      {/* sender (+ date on mobile) */}
      <span className="flex items-center justify-between gap-2 sm:block sm:min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="sm:hidden">
            {email.is_starred ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> : unread ? <span className="block h-2 w-2 rounded-full bg-brand-500" /> : <span className="block h-2 w-2" />}
          </span>
          <span className={cn("truncate", unread ? "font-semibold text-neutral-900" : "text-neutral-700")} title={email.from_email ?? ""}>
            {sender}
          </span>
        </span>
        <span className="shrink-0 text-xs text-neutral-500 sm:hidden">{formatEmailDate(email.received_at)}</span>
      </span>

      {/* subject + snippet */}
      <span className="mt-0.5 flex min-w-0 items-center gap-2 sm:mt-0">
        <span className={cn("truncate", unread ? "font-medium text-neutral-900" : "text-neutral-800")}>{email.subject || "(no subject)"}</span>
        <span className="hidden truncate text-neutral-500 md:inline">— {truncate(email.snippet, 90)}</span>
      </span>

      {/* badges + date */}
      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-0 sm:flex-nowrap sm:justify-end sm:whitespace-nowrap">
        {email.has_attachments ? <Paperclip className="h-3.5 w-3.5 text-neutral-400" /> : null}
        {email.analysis?.priority && email.analysis.priority !== "normal" ? <Badge tone={priorityTone(email.analysis.priority)}>{email.analysis.priority}</Badge> : null}
        {email.analysis?.category ? <Badge>{email.analysis.category}</Badge> : null}
        {showAccount && email.account ? (
          <Badge tone="neutral">
            {providerLabel(email.account.provider)} · {email.account.email.split("@")[0]}
          </Badge>
        ) : null}
        <span className="hidden w-14 text-right text-xs text-neutral-500 sm:inline">{formatEmailDate(email.received_at)}</span>
      </span>
    </Link>
  );
}
