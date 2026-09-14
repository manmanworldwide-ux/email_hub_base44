import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getAppSettings } from "@/lib/auth/settings";
import type { InvitationKind, InvitationPublic, InvitationRow, UserRole } from "@/types/saas";

const PUBLIC_COLUMNS =
  "id, kind, email, role, can_create_api_keys, target_user_id, token_prefix, note, created_by, expires_at, accepted_at, accepted_user_id, revoked_at, created_at";

function withStatus(row: Omit<InvitationRow, "token_hash">): InvitationPublic {
  const status: InvitationPublic["status"] = row.accepted_at
    ? "accepted"
    : row.revoked_at
      ? "revoked"
      : new Date(row.expires_at).getTime() < Date.now()
        ? "expired"
        : "pending";
  return { ...row, status };
}

export function invitationUrl(token: string): string {
  return `${env.appUrl}/invite/${token}`;
}

export interface CreateInvitationInput {
  kind?: InvitationKind;
  email: string;
  role?: UserRole;
  canCreateApiKeys?: boolean;
  expiresInDays?: number;
  note?: string | null;
  targetUserId?: string | null;
}

/** Admin: creates an invitation (or password-reset) link. The raw token is returned once. */
export async function createInvitation(
  db: SupabaseClient,
  adminId: string,
  input: CreateInvitationInput,
): Promise<{ invitation: InvitationPublic; token: string; url: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("A valid email address is required");
  const settings = await getAppSettings(db);
  const days = input.expiresInDays ?? settings.invitation_expiry_days;
  const token = `inv_${randomToken(32)}`;

  // Supersede older pending links for the same email/kind so only one is valid.
  await db
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("kind", input.kind ?? "invite")
    .ilike("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const { data, error } = await db
    .from("invitations")
    .insert({
      kind: input.kind ?? "invite",
      email,
      role: input.role ?? "member",
      can_create_api_keys: input.canCreateApiKeys ?? settings.default_can_create_api_keys,
      target_user_id: input.targetUserId ?? null,
      token_hash: sha256Hex(token),
      token_prefix: token.slice(0, 10),
      note: input.note ?? null,
      created_by: adminId,
      expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    })
    .select(PUBLIC_COLUMNS)
    .single();
  if (error) throw new ApiError(500, `Failed to create invitation: ${error.message}`);
  return { invitation: withStatus(data as Omit<InvitationRow, "token_hash">), token, url: invitationUrl(token) };
}

export async function listInvitations(db: SupabaseClient): Promise<InvitationPublic[]> {
  const { data, error } = await db.from("invitations").select(PUBLIC_COLUMNS).order("created_at", { ascending: false }).limit(200);
  if (error) throw new ApiError(500, error.message);
  return ((data ?? []) as Omit<InvitationRow, "token_hash">[]).map(withStatus);
}

export async function revokeInvitation(db: SupabaseClient, id: string): Promise<InvitationPublic> {
  const { data, error } = await db
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("accepted_at", null)
    .select(PUBLIC_COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw notFound("Invitation not found or already accepted");
  return withStatus(data as Omit<InvitationRow, "token_hash">);
}

/** Public: validates a raw token and returns the invitation if it can still be used. */
export async function validateInvitationToken(token: string): Promise<InvitationRow | null> {
  if (!token || !token.startsWith("inv_")) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("invitations").select("*").eq("token_hash", sha256Hex(token)).maybeSingle();
  const row = data as InvitationRow | null;
  if (!row || row.accepted_at || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export interface AcceptInvitationInput {
  token: string;
  password: string;
  fullName?: string | null;
}

/**
 * Public: accepts an invitation - creates the user (or, for resets / existing emails, sets a
 * new password) and marks the invitation accepted. Returns the email so the client can sign in.
 */
export async function acceptInvitation(input: AcceptInvitationInput): Promise<{ email: string; created: boolean }> {
  const invitation = await validateInvitationToken(input.token);
  if (!invitation) throw badRequest("This link is invalid, expired or has already been used", "invalid_invitation");
  if (input.password.length < 8) throw badRequest("Password must be at least 8 characters");

  const admin = createAdminClient();
  const email = invitation.email.toLowerCase();

  // Resolve an existing user for this email (profiles mirrors auth.users emails).
  let existingId = invitation.target_user_id;
  if (!existingId) {
    const { data: existing } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    existingId = (existing as { id: string } | null)?.id ?? null;
  }

  let userId: string;
  let created = false;
  if (existingId) {
    const { error } = await admin.auth.admin.updateUserById(existingId, {
      password: input.password,
      email_confirm: true,
      ban_duration: "none",
      ...(input.fullName ? { user_metadata: { full_name: input.fullName } } : {}),
    });
    if (error) throw new ApiError(500, `Could not update the account: ${error.message}`);
    userId = existingId;
    const profilePatch: Record<string, unknown> = { status: "active" };
    if (input.fullName) profilePatch.full_name = input.fullName;
    if (invitation.kind === "invite") {
      profilePatch.role = invitation.role;
      profilePatch.can_create_api_keys = invitation.can_create_api_keys;
    }
    await admin.from("profiles").update(profilePatch).eq("id", userId);
  } else {
    if (invitation.kind === "reset") throw badRequest("The account for this reset link no longer exists", "invalid_invitation");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName ?? null, invited: true },
    });
    if (error || !data.user) throw new ApiError(500, `Could not create the account: ${error?.message ?? "unknown error"}`);
    userId = data.user.id;
    created = true;
    // The auth trigger already applied role/permissions from the invitation; make sure they stick.
    await admin
      .from("profiles")
      .update({
        role: invitation.role,
        can_create_api_keys: invitation.can_create_api_keys,
        full_name: input.fullName ?? null,
        invited_by: invitation.created_by,
      })
      .eq("id", userId);
  }

  await admin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString(), accepted_user_id: userId })
    .eq("id", invitation.id);

  return { email, created };
}
