function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Lazy environment accessors. Values are read on access so that `next build`
 * succeeds without secrets and misconfiguration surfaces at request time.
 */
export const env = {
  /** Public origin of this deployment. Falls back to Vercel's per-deployment URL (previews), then localhost. */
  get appUrl(): string {
    const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (explicit) return explicit.replace(/\/$/, "");
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  },
  get supabaseUrl(): string {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey(): string {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get tokenEncryptionKey(): string {
    return required("TOKEN_ENCRYPTION_KEY");
  },
  get cronSecret(): string | undefined {
    return process.env.CRON_SECRET;
  },
  /** Emails that are always promoted to admin on login (comma separated). */
  get adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  get supabaseConfigured(): boolean {
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  google: {
    get clientId(): string {
      return required("GOOGLE_CLIENT_ID");
    },
    get clientSecret(): string {
      return required("GOOGLE_CLIENT_SECRET");
    },
    get configured(): boolean {
      return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    },
  },
  microsoft: {
    get clientId(): string {
      return required("MICROSOFT_CLIENT_ID");
    },
    get clientSecret(): string {
      return required("MICROSOFT_CLIENT_SECRET");
    },
    get tenant(): string {
      return process.env.MICROSOFT_TENANT || "common";
    },
    get configured(): boolean {
      return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    },
  },
  ai: {
    get model(): string {
      return process.env.AI_MODEL || "claude-opus-5";
    },
    get analysisModel(): string {
      return process.env.AI_ANALYSIS_MODEL || process.env.AI_MODEL || "claude-opus-5";
    },
    get autoAnalyze(): boolean {
      return bool("AI_AUTO_ANALYZE", true);
    },
    get autoAnalyzeLimit(): number {
      return int("AI_AUTO_ANALYZE_LIMIT", 10);
    },
    get configured(): boolean {
      return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
    },
  },
  sync: {
    get initialDays(): number {
      return int("INITIAL_SYNC_DAYS", 30);
    },
    get maxMessagesPerSync(): number {
      return int("MAX_MESSAGES_PER_SYNC", 100);
    },
  },
};
