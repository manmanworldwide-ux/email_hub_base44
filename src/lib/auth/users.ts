import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminUserSummary, ProfileRow, UserRole, UserStatus } from "@/types/saas";

/** Admin: all users with auth metadata and usage counts. */
export async function listUsers(db: SupabaseClient): Promise<AdminUserSummary[]> {
  const admin = createAdminClient();
  const [{ data: profiles, error }, stats, authUsers] = await Promise.all([
    db.from("profiles").select("*").order("created_at", { ascending: true }),
    db.rpc("admin_user_stats"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (error) throw new ApiError(500, error.message);

  const statMap = new Map<string, { accounts: number; emails: number; api_keys: number }>();
  for (const s of ((stats.data ?? []) as { user_id: string; accounts: number | string; emails: number | string; api_keys: number | string }[])) {
    statMap.set(s.user_id, { accounts: Number(s.accounts), emails: Number(s.emails), api_keys: Number(s.api_keys) });
  }
  const lastSignIn = new Map<string, string | null>();
  for (const u of authUsers.data?.users ?? []) lastSignIn.set(u.id, u.last_sign_in_at ?? null);

  return ((profiles ?? []) as ProfileRow[]).map((p) => ({
    id: p.id,
    email: p.email ?? "",
    full_name: p.full_name,
    role: p.role,
    status: p.status,
    can_create_api_keys: p.can_create_api_keys,
    created_at: p.created_at,
    last_sign_in_at: lastSignIn.get(p.id) ?? null,
    accounts: statMap.get(p.id)?.accounts ?? 0,
    emails: statMap.get(p.id)?.emails ?? 0,
    api_keys: statMap.get(p.id)?.api_keys ?? 0,
  }));
}

export interface UpdateUserInput {
  role?: UserRole;
  status?: UserStatus;
  can_create_api_keys?: boolean;
  full_name?: string | null;
}

export async function updateUser(db: SupabaseClient, actingAdminId: string, userId: string, input: UpdateUserInput): Promise<ProfileRow> {
  if (userId === actingAdminId && (input.role === "member" || input.status === "disabled")) {
    throw badRequest("You cannot demote or disable your own account", "self_modification");
  }
  if (input.role === "member" || input.status === "disabled") {
    const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("status", "active");
    const { data: target } = await db.from("profiles").select("role, status").eq("id", userId).maybeSingle();
    const t = target as { role: UserRole; status: UserStatus } | null;
    if (t?.role === "admin" && t.status === "active" && (count ?? 0) <= 1) {
      throw badRequest("At least one active administrator is required", "last_admin");
    }
  }

  const { data, error } = await db.from("profiles").update(input).eq("id", userId).select("*").maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound("User not found");

  if (input.status) {
    // Enforce at the auth layer too: banned users cannot obtain a session.
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(userId, { ban_duration: input.status === "disabled" ? "876000h" : "none" });
  }
  return data as ProfileRow;
}

export async function deleteUser(actingAdminId: string, userId: string): Promise<void> {
  if (userId === actingAdminId) throw badRequest("You cannot delete your own account", "self_modification");
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new ApiError(500, `Failed to delete user: ${error.message}`);
}
