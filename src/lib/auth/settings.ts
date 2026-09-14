import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppSettings } from "@/types/saas";

export const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  app_name: "Email Hub",
  allow_self_signup: false,
  allow_platform_ai: true,
  default_can_create_api_keys: false,
  invitation_expiry_days: 7,
  updated_at: new Date(0).toISOString(),
  updated_by: null,
};

/** Reads global settings. Falls back to defaults if the row is missing (pre-migration). */
export async function getAppSettings(db?: SupabaseClient): Promise<AppSettings> {
  const client = db ?? createAdminClient();
  const { data, error } = await client.from("app_settings").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  return data as AppSettings;
}

export async function updateAppSettings(
  db: SupabaseClient,
  userId: string,
  patch: Partial<Pick<AppSettings, "app_name" | "allow_self_signup" | "allow_platform_ai" | "default_can_create_api_keys" | "invitation_expiry_days">>,
): Promise<AppSettings> {
  const { data, error } = await db
    .from("app_settings")
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: userId })
    .eq("id", 1)
    .select("*")
    .single();
  if (error) throw new ApiError(500, `Failed to update settings: ${error.message}`);
  return data as AppSettings;
}

/** Whether anyone has signed up yet (the first account becomes the administrator). */
export async function hasAnyUsers(): Promise<boolean> {
  const admin = createAdminClient();
  const { count, error } = await admin.from("profiles").select("id", { count: "exact", head: true });
  if (error) return true;
  return (count ?? 0) > 0;
}
