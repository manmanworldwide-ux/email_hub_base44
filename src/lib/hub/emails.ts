import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { getProvider } from "@/lib/providers";
import { textToHtml, htmlToText } from "@/lib/utils";
import { getAccessToken, getAccountRow } from "@/lib/hub/accounts";
import {
  EMAIL_LIST_COLUMNS,
  type Address,
  type EmailAnalysisRow,
  type EmailListItem,
  type EmailRow,
} from "@/types";

export interface EmailFilters {
  accountId?: string;
  q?: string;
  from?: string;
  unread?: boolean;
  starred?: boolean;
  folder?: string;
  category?: string;
  priority?: string;
  requiresResponse?: boolean;
  since?: string;
  until?: string;
  threadId?: string;
  limit: number;
  offset: number;
}

export interface EmailListResult {
  items: EmailListItem[];
  total: number;
  limit: number;
  offset: number;
}

const ANALYSIS_EMBED = "analysis:email_analyses(category, priority, sentiment, summary, requires_response)";
const ACCOUNT_EMBED = "account:connected_accounts(id, provider, email)";

/** Builds a safe prefix-matching tsquery: "inv acme" -> "inv:* & acme:*". */
function sanitizeSearch(q: string): string {
  return q
    .replace(/[^\p{L}\p{N}\s@._-]/gu, " ")
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[._@-]+|[._@-]+$/g, ""))
    .filter((t) => /[\p{L}\p{N}]/u.test(t))
    .slice(0, 8)
    .map((t) => `${t}:*`)
    .join(" & ");
}

export async function listEmails(db: SupabaseClient, userId: string, filters: EmailFilters): Promise<EmailListResult> {
  const needsAnalysisJoin = Boolean(filters.category || filters.priority || filters.requiresResponse !== undefined);
  const analysisSelect = needsAnalysisJoin
    ? "analysis:email_analyses!inner(category, priority, sentiment, summary, requires_response)"
    : ANALYSIS_EMBED;

  let query = db
    .from("emails")
    .select(`${EMAIL_LIST_COLUMNS}, ${analysisSelect}, ${ACCOUNT_EMBED}`, { count: "exact" })
    .eq("user_id", userId)
    .eq("is_draft", false);

  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.threadId) query = query.eq("thread_id", filters.threadId);
  if (filters.from) query = query.ilike("from_email", `%${filters.from}%`);
  if (filters.unread !== undefined) query = query.eq("is_read", !filters.unread);
  if (filters.starred !== undefined) query = query.eq("is_starred", filters.starred);
  if (filters.folder) {
    if (filters.folder === "sent") query = query.eq("is_sent", true);
    else query = query.eq("folder", filters.folder).eq("is_sent", false);
  } else {
    query = query.or("folder.is.null,folder.not.in.(trash,spam)");
  }
  if (filters.since) query = query.gte("received_at", filters.since);
  if (filters.until) query = query.lte("received_at", filters.until);
  if (filters.category) query = query.eq("analysis.category", filters.category);
  if (filters.priority) query = query.eq("analysis.priority", filters.priority);
  if (filters.requiresResponse !== undefined) query = query.eq("analysis.requires_response", filters.requiresResponse);
  if (filters.q) {
    const ts = sanitizeSearch(filters.q);
    if (ts) query = query.textSearch("search_vector", ts, { config: "english" });
  }

  const { data, error, count } = await query
    .order("received_at", { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1);

  if (error) throw new ApiError(500, error.message);
  return { items: (data ?? []) as unknown as EmailListItem[], total: count ?? 0, limit: filters.limit, offset: filters.offset };
}

export interface EmailDetail extends EmailRow {
  analysis: EmailAnalysisRow | null;
  account: { id: string; provider: string; email: string } | null;
  thread: EmailListItem[];
}

export async function getEmail(db: SupabaseClient, userId: string, emailId: string): Promise<EmailDetail> {
  const { data, error } = await db
    .from("emails")
    .select(`*, analysis:email_analyses(*), ${ACCOUNT_EMBED}`)
    .eq("user_id", userId)
    .eq("id", emailId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound("Email not found");

  const row = data as unknown as EmailRow & { analysis: EmailAnalysisRow | EmailAnalysisRow[] | null; account: EmailDetail["account"] };
  const analysis = Array.isArray(row.analysis) ? row.analysis[0] ?? null : row.analysis;

  let thread: EmailListItem[] = [];
  if (row.thread_id) {
    const { data: threadRows } = await db
      .from("emails")
      .select(EMAIL_LIST_COLUMNS)
      .eq("user_id", userId)
      .eq("account_id", row.account_id)
      .eq("thread_id", row.thread_id)
      .order("received_at", { ascending: true })
      .limit(50);
    thread = (threadRows ?? []) as unknown as EmailListItem[];
  }

  return { ...row, analysis, thread };
}

export async function getEmailRow(db: SupabaseClient, userId: string, emailId: string): Promise<EmailRow> {
  const { data, error } = await db.from("emails").select("*").eq("user_id", userId).eq("id", emailId).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound("Email not found");
  return data as EmailRow;
}

export async function updateEmailFlags(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  flags: { is_read?: boolean; is_starred?: boolean },
  pushToProvider = true,
): Promise<EmailRow> {
  const email = await getEmailRow(db, userId, emailId);
  if (pushToProvider) {
    const account = await getAccountRow(db, userId, email.account_id);
    const provider = getProvider(account.provider);
    const token = await getAccessToken(db, account);
    if (flags.is_read !== undefined && flags.is_read !== email.is_read) {
      await provider.setRead(token, email.provider_message_id, flags.is_read);
    }
    if (flags.is_starred !== undefined && flags.is_starred !== email.is_starred) {
      await provider.setStarred(token, email.provider_message_id, flags.is_starred);
    }
  }
  const { data, error } = await db
    .from("emails")
    .update(flags)
    .eq("id", emailId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new ApiError(500, error.message);
  return data as EmailRow;
}

export interface SendEmailInput {
  accountId: string;
  to: Address[];
  cc?: Address[];
  bcc?: Address[];
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
}

export async function sendEmail(db: SupabaseClient, userId: string, input: SendEmailInput) {
  if (!input.to.length) throw badRequest("At least one recipient is required");
  if (!input.bodyText && !input.bodyHtml) throw badRequest("Email body is required");

  const account = await getAccountRow(db, userId, input.accountId);
  const provider = getProvider(account.provider);
  const token = await getAccessToken(db, account);

  const result = await provider.sendMail(token, {
    fromName: account.display_name,
    fromEmail: account.email,
    to: input.to,
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    subject: input.subject,
    text: input.bodyText ?? (input.bodyHtml ? htmlToText(input.bodyHtml) : null),
    html: input.bodyHtml ?? (input.bodyText ? textToHtml(input.bodyText) : null),
  });

  return {
    account_id: account.id,
    provider: account.provider,
    from: account.email,
    provider_message_id: result.providerMessageId,
    thread_id: result.threadId,
    status: "sent" as const,
  };
}

export interface ReplyEmailInput {
  bodyText?: string | null;
  bodyHtml?: string | null;
  replyAll?: boolean;
}

export async function replyToEmail(db: SupabaseClient, userId: string, emailId: string, input: ReplyEmailInput) {
  if (!input.bodyText && !input.bodyHtml) throw badRequest("Reply body is required");
  const email = await getEmailRow(db, userId, emailId);
  const account = await getAccountRow(db, userId, email.account_id);
  const provider = getProvider(account.provider);
  const token = await getAccessToken(db, account);

  const result = await provider.replyToMessage(token, email, {
    fromName: account.display_name,
    fromEmail: account.email,
    text: input.bodyText ?? (input.bodyHtml ? htmlToText(input.bodyHtml) : null),
    html: input.bodyHtml ?? (input.bodyText ? textToHtml(input.bodyText) : null),
    replyAll: Boolean(input.replyAll),
  });

  if (!email.is_read) {
    await db.from("emails").update({ is_read: true }).eq("id", email.id);
    await provider.setRead(token, email.provider_message_id, true).catch(() => undefined);
  }

  return {
    replied_to: email.id,
    account_id: account.id,
    provider: account.provider,
    from: account.email,
    provider_message_id: result.providerMessageId,
    thread_id: result.threadId,
    status: "sent" as const,
  };
}
