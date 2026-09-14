import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import type { ProfileRow, SessionUser } from "@/types/saas";

function toSessionUser(user: User, profile: ProfileRow | null): SessionUser {
  return {
    id: user.id,
    email: user.email ?? profile?.email ?? "",
    fullName: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
    role: profile?.role ?? "member",
    status: profile?.status ?? "active",
    canCreateApiKeys: profile?.can_create_api_keys ?? false,
    tourCompletedAt: profile?.tour_completed_at ?? null,
    createdAt: profile?.created_at ?? user.created_at,
  };
}

/**
 * Loads the profile for a user id. Uses the service role so it also works before RLS policies
 * exist and for API-key callers. Applies ADMIN_EMAILS auto-promotion.
 */
export async function loadProfile(userId: string, email?: string | null): Promise<ProfileRow | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  let profile = (data as ProfileRow | null) ?? null;

  if (!profile && email) {
    // Profile row missing (user pre-dates the trigger) - create it.
    const { data: created } = await admin
      .from("profiles")
      .insert({ id: userId, email, role: "member" })
      .select("*")
      .maybeSingle();
    profile = (created as ProfileRow | null) ?? null;
  }

  const promote = email && env.adminEmails.includes(email.toLowerCase());
  if (profile && promote && profile.role !== "admin") {
    const { data: updated } = await admin
      .from("profiles")
      .update({ role: "admin", can_create_api_keys: true })
      .eq("id", userId)
      .select("*")
      .maybeSingle();
    profile = (updated as ProfileRow | null) ?? profile;
  }
  return profile;
}

export async function getSession(): Promise<{ supabase: SupabaseClient; user: SessionUser | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  const profile = await loadProfile(user.id, user.email);
  return { supabase, user: toSessionUser(user, profile) };
}

/** Server components inside the app shell: redirects to login (or signs out disabled users). */
export async function requireSession(): Promise<{ supabase: SupabaseClient; user: SessionUser }> {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");
  if (user.status === "disabled") {
    await supabase.auth.signOut();
    redirect("/login?error=disabled");
  }
  return { supabase, user };
}

export async function requireAdminSession(): Promise<{ supabase: SupabaseClient; user: SessionUser }> {
  const session = await requireSession();
  if (session.user.role !== "admin") redirect("/dashboard?error=admin_only");
  return session;
}
