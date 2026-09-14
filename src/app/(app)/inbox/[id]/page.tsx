import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getEmail } from "@/lib/hub/emails";
import { ApiError } from "@/lib/api/errors";
import { AnalyzeButton, EmailBody, EmailToolbar, MarkReadOnOpen, ReplyForm } from "@/components/email-actions";
import { Badge, Card, CardHeader, priorityTone, sentimentTone } from "@/components/ui";
import { formatDateTime, formatEmailDate, initials, providerLabel } from "@/lib/utils";
import { env } from "@/lib/env";

export const metadata = { title: "Email" };

function addressList(list: { name: string | null; email: string }[]) {
  return list.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", ");
}

export default async function EmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  let email;
  try {
    email = await getEmail(supabase, user.id, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const analysis = email.analysis;
  const others = email.thread.filter((t) => t.id !== email.id);

  return (
    <>
      <MarkReadOnOpen emailId={email.id} isRead={email.is_read} />
      <div className="mb-4 flex items-center justify-between">
        <Link href="/inbox" className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900">
          <ArrowLeft className="h-4 w-4" /> Back to inbox
        </Link>
        <EmailToolbar emailId={email.id} isRead={email.is_read} isStarred={email.is_starred} webLink={email.web_link} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <div className="border-b border-neutral-100 px-6 py-5">
              <h1 className="text-lg font-semibold text-neutral-900">{email.subject || "(no subject)"}</h1>
              <div className="mt-3 flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700">
                  {initials(email.from_name ?? email.from_email)}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-neutral-900">
                    {email.from_name || email.from_email}
                    {email.from_name ? <span className="ml-1 font-normal text-neutral-500">&lt;{email.from_email}&gt;</span> : null}
                  </p>
                  <p className="truncate text-xs text-neutral-500">to {addressList(email.to_recipients) || "—"}</p>
                  {email.cc_recipients?.length ? <p className="truncate text-xs text-neutral-500">cc {addressList(email.cc_recipients)}</p> : null}
                </div>
                <div className="text-right text-xs text-neutral-500">
                  <p>{formatDateTime(email.received_at)}</p>
                  <p className="mt-1 flex items-center justify-end gap-1">
                    {email.has_attachments ? <Paperclip className="h-3 w-3" /> : null}
                    {email.account ? (
                      <Badge>
                        {providerLabel(email.account.provider)} · {email.account.email}
                      </Badge>
                    ) : null}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <EmailBody text={email.body_text} html={email.body_html} />
            </div>
          </Card>

          {others.length ? (
            <Card>
              <CardHeader title={`Thread (${others.length} other message${others.length === 1 ? "" : "s"})`} />
              <ul className="divide-y divide-neutral-100">
                {others.map((t) => (
                  <li key={t.id}>
                    <Link href={`/inbox/${t.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-neutral-50">
                      <span className="w-40 truncate text-neutral-700">{t.is_sent ? "You" : t.from_name || t.from_email}</span>
                      <span className="flex-1 truncate text-neutral-500">{t.snippet}</span>
                      <span className="text-xs text-neutral-500">{formatEmailDate(t.received_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Reply" description={`Sends from ${email.account?.email ?? "this mailbox"} and keeps the thread`} />
            <div className="px-5 py-4">
              <ReplyForm emailId={email.id} suggestedReply={analysis?.suggested_reply ?? null} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="AI analysis" action={env.ai.configured ? <AnalyzeButton emailId={email.id} hasAnalysis={Boolean(analysis)} /> : undefined} />
            <div className="space-y-4 px-5 py-4 text-sm">
              {!env.ai.configured ? (
                <p className="text-xs text-amber-700">Set ANTHROPIC_API_KEY to enable AI analysis.</p>
              ) : !analysis ? (
                <p className="text-xs text-neutral-500">Not analysed yet. Run the analysis to get a summary, priority, action items and a suggested reply.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="brand">{analysis.category}</Badge>
                    <Badge tone={priorityTone(analysis.priority)}>{analysis.priority}</Badge>
                    <Badge tone={sentimentTone(analysis.sentiment)}>{analysis.sentiment}</Badge>
                    {analysis.requires_response ? <Badge tone="warning">needs reply</Badge> : null}
                    {analysis.language && analysis.language !== "en" ? <Badge>{analysis.language}</Badge> : null}
                  </div>
                  {analysis.intent ? (
                    <p className="text-xs text-neutral-500">
                      Intent: <span className="text-neutral-800">{analysis.intent}</span>
                    </p>
                  ) : null}
                  <div>
                    <p className="text-xs font-medium text-neutral-500">Summary</p>
                    <p className="mt-1 text-neutral-800">{analysis.summary}</p>
                  </div>
                  {analysis.action_items?.length ? (
                    <div>
                      <p className="text-xs font-medium text-neutral-500">Action items</p>
                      <ul className="mt-1 space-y-1">
                        {analysis.action_items.map((a, i) => (
                          <li key={i} className="flex gap-2 text-neutral-800">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                            <span>
                              {a.text}
                              {a.due ? <span className="ml-1 text-xs text-neutral-500">(due {a.due})</span> : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {analysis.entities &&
                  (analysis.entities.people?.length || analysis.entities.organizations?.length || analysis.entities.amounts?.length || analysis.entities.dates?.length) ? (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {(["people", "organizations", "dates", "amounts"] as const).map((k) =>
                        analysis.entities[k]?.length ? (
                          <div key={k}>
                            <p className="font-medium capitalize text-neutral-500">{k}</p>
                            <p className="mt-0.5 text-neutral-800">{analysis.entities[k].join(", ")}</p>
                          </div>
                        ) : null,
                      )}
                    </div>
                  ) : null}
                  {analysis.suggested_reply ? (
                    <div>
                      <p className="text-xs font-medium text-neutral-500">Suggested reply</p>
                      <p className="mt-1 whitespace-pre-wrap rounded-md bg-neutral-50 p-3 text-xs text-neutral-800">{analysis.suggested_reply}</p>
                    </div>
                  ) : null}
                  <p className="text-[11px] text-neutral-400">
                    {analysis.model} · {formatDateTime(analysis.created_at)}
                  </p>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <dl className="grid grid-cols-[90px_1fr] gap-y-2 px-5 py-4 text-xs">
              <dt className="text-neutral-500">Folder</dt>
              <dd className="text-neutral-800">{email.is_sent ? "sent" : email.folder}</dd>
              <dt className="text-neutral-500">Labels</dt>
              <dd className="text-neutral-800">{email.labels?.length ? email.labels.join(", ") : "—"}</dd>
              <dt className="text-neutral-500">Importance</dt>
              <dd className="text-neutral-800">{email.importance ?? "normal"}</dd>
              <dt className="text-neutral-500">Message-ID</dt>
              <dd className="truncate text-neutral-800" title={email.internet_message_id ?? ""}>
                {email.internet_message_id ?? "—"}
              </dd>
              <dt className="text-neutral-500">Hub id</dt>
              <dd className="truncate font-mono text-[11px] text-neutral-800">{email.id}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
