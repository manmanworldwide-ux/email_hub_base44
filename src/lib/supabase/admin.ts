import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS - only use server-side and always filter by user_id.
 * Used for API-key authenticated requests and scheduled sync jobs.
 */
export function createAdminClient(): SupabaseClient {
  return createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Client acting as a user via their Supabase access token (RLS applies). */
export function createUserTokenClient(accessToken: string): SupabaseClient {
  return createSupabaseClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
