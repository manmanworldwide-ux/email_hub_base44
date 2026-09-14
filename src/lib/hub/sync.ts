import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";
import { getProvider, ProviderHttpError } from "@/lib/providers";
import { getAccessToken, getAccountRow, listAccountRows, markAccountStatus } from "@/lib/hub/accounts";
import { syncCalendarForAccount } from "@/lib/hub/calendar";
import { analyzeUnanalyzedEmails } from "@/lib/ai/analyze";
import type { ConnectedAccountRow, NormalizedEmail, SyncState } from "@/types";

export interface SyncResult {
  account_id: string;
  email: string;
  provider: string;
  status: "ok" | "error";
  emails_synced: number;
  events_synced: number;
  analyses_run: number;
  backfill_complete: boolean;
  duration_ms: number;
  error?: string;
}

const OVERLAP_MS = 24 * 3_600_000;

async function upsertEmails(db: SupabaseClient, account: ConnectedAccountRow, messages: NormalizedEmail[]) {
  if (!messages.length) return 0;
  const rows = messages.map((m) => ({ ...m, user_id: account.user_id, account_id: account.id }));
  const { error } = await db.from("emails").upsert(rows, { onConflict: "account_id,provider_message_id" });
  if (error) throw new ApiError(500, `Failed to store emails: ${error.message}`);
  return rows.length;
}

/**
 * Syncs one connected account: mail (windowed, paginated backfill then incremental
 * overlap window), calendar events, and optional AI analysis of new messages.
 */
export async function syncAccount(
  db: SupabaseClient,
  account: ConnectedAccountRow,
  options: { calendar?: boolean; analyze?: boolean; maxMessages?: number } = {},
): Promise<SyncResult> {
  const started = Date.now();
  const provider = getProvider(account.provider);
  const maxMessages = options.maxMessages ?? env.sync.maxMessagesPerSync;

  const { data: logRow } = await db
    .from("sync_logs")
    .insert({ user_id: account.user_id, account_id: account.id })
    .select("id")
    .single();
  const logId = (logRow as { id: string } | null)?.id;

  const result: SyncResult = {
    account_id: account.id,
    email: account.email,
    provider: account.provider,
    status: "ok",
    emails_synced: 0,
    events_synced: 0,
    analyses_run: 0,
    backfill_complete: false,
    duration_ms: 0,
  };

  try {
    const token = await getAccessToken(db, account);
    const state: SyncState = { ...(account.sync_state ?? {}) };

    if (!state.mode) {
      state.mode = "backfill";
      state.window_start = new Date(Date.now() - env.sync.initialDays * 86_400_000).toISOString();
      state.backfill_started_at = new Date().toISOString();
      state.page_token = null;
    }

    const runStartedAt = new Date().toISOString();
    let since: Date;
    let pageToken: string | null;
    if (state.mode === "backfill") {
      since = new Date(state.window_start ?? Date.now() - env.sync.initialDays * 86_400_000);
      pageToken = state.page_token ?? null;
    } else {
      const anchor = state.last_incremental_at ?? state.backfill_started_at;
      const last = anchor ? new Date(anchor).getTime() : Date.now() - 86_400_000;
      since = new Date(last - OVERLAP_MS);
      pageToken = null;
    }

    let fetched = 0;
    let exhausted = false;
    while (fetched < maxMessages) {
      const page = await provider.listMessages(token, {
        since,
        pageToken,
        maxResults: Math.min(50, maxMessages - fetched),
      });
      fetched += page.messages.length;
      result.emails_synced += await upsertEmails(db, account, page.messages);
      pageToken = page.nextPageToken;
      if (!pageToken || page.messages.length === 0) {
        exhausted = true;
        break;
      }
    }

    if (state.mode === "backfill") {
      if (exhausted) {
        // Backfill done. Anchor the first incremental window to when the backfill began so
        // anything that arrived during the (possibly multi-run) backfill is still picked up.
        state.mode = "incremental";
        state.page_token = null;
        state.last_incremental_at = state.backfill_started_at ?? runStartedAt;
        result.backfill_complete = true;
      } else {
        state.page_token = pageToken;
      }
    } else {
      result.backfill_complete = true;
      state.last_incremental_at = runStartedAt;
    }

    if (options.calendar !== false) {
      try {
        result.events_synced = await syncCalendarForAccount(db, account, token);
      } catch (error) {
        console.warn(`[sync] calendar sync failed for ${account.email}:`, error);
      }
    }

    await db
      .from("connected_accounts")
      .update({ sync_state: state, last_synced_at: new Date().toISOString(), status: "active", last_error: null })
      .eq("id", account.id);

    const shouldAnalyze = options.analyze ?? env.ai.autoAnalyze;
    if (shouldAnalyze && env.ai.configured && result.emails_synced > 0) {
      try {
        const analyzed = await analyzeUnanalyzedEmails(db, account.user_id, {
          limit: env.ai.autoAnalyzeLimit,
          accountId: account.id,
        });
        result.analyses_run = analyzed.analyzed;
      } catch (error) {
        console.warn(`[sync] auto-analysis failed for ${account.email}:`, error);
      }
    }
  } catch (error) {
    result.status = "error";
    result.error = error instanceof Error ? error.message : String(error);
    const authFailure =
      (error instanceof ProviderHttpError && error.isAuthError) ||
      (error instanceof ApiError && error.code === "needs_reauth");
    await markAccountStatus(db, account.id, authFailure ? "needs_reauth" : "error", result.error);
  }

  result.duration_ms = Date.now() - started;
  if (logId) {
    await db
      .from("sync_logs")
      .update({
        finished_at: new Date().toISOString(),
        status: result.status,
        emails_synced: result.emails_synced,
        events_synced: result.events_synced,
        analyses_run: result.analyses_run,
        error: result.error ?? null,
      })
      .eq("id", logId);
  }
  return result;
}

export async function syncAccountById(db: SupabaseClient, userId: string, accountId: string): Promise<SyncResult> {
  const account = await getAccountRow(db, userId, accountId);
  return syncAccount(db, account);
}

export async function syncAllForUser(db: SupabaseClient, userId: string): Promise<SyncResult[]> {
  const accounts = (await listAccountRows(db, userId)).filter((a) => a.status !== "disabled");
  const results: SyncResult[] = [];
  for (const account of accounts) {
    results.push(await syncAccount(db, account));
  }
  return results;
}

/**
 * Used by the scheduled job: syncs the least-recently-synced active accounts across all users.
 * Keep `limit` small so a run fits inside the serverless time budget; the job repeats every few minutes.
 */
export async function syncEverything(admin: SupabaseClient, limit = 5): Promise<SyncResult[]> {
  const { data, error } = await admin
    .from("connected_accounts")
    .select("*")
    .in("status", ["active", "error"])
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new ApiError(500, error.message);
  const results: SyncResult[] = [];
  for (const account of (data ?? []) as ConnectedAccountRow[]) {
    results.push(await syncAccount(admin, account));
  }
  return results;
}
