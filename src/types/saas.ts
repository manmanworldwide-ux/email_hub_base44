export type UserRole = "admin" | "member";
export type UserStatus = "active" | "disabled";

export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  can_create_api_keys: boolean;
  tour_completed_at: string | null;
  onboarding: Record<string, unknown>;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  status: UserStatus;
  canCreateApiKeys: boolean;
  tourCompletedAt: string | null;
  createdAt: string;
}

export interface AppSettings {
  id: number;
  app_name: string;
  allow_self_signup: boolean;
  allow_platform_ai: boolean;
  default_can_create_api_keys: boolean;
  invitation_expiry_days: number;
  updated_at: string;
  updated_by: string | null;
}

export type InvitationKind = "invite" | "reset";

export interface InvitationRow {
  id: string;
  kind: InvitationKind;
  email: string;
  role: UserRole;
  can_create_api_keys: boolean;
  target_user_id: string | null;
  token_hash: string;
  token_prefix: string;
  note: string | null;
  created_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  accepted_user_id: string | null;
  revoked_at: string | null;
  created_at: string;
}

export type InvitationPublic = Omit<InvitationRow, "token_hash"> & {
  status: "pending" | "accepted" | "revoked" | "expired";
};

export interface AdminUserSummary {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: UserStatus;
  can_create_api_keys: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  accounts: number;
  emails: number;
  api_keys: number;
}

export type LlmProvider = "anthropic" | "openai" | "google" | "openai_compatible";

export interface AiIntegrationRow {
  id: string;
  user_id: string;
  provider: LlmProvider;
  label: string;
  model: string;
  api_key_enc: string;
  key_hint: string | null;
  base_url: string | null;
  is_default: boolean;
  enabled: boolean;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type AiIntegrationPublic = Omit<AiIntegrationRow, "api_key_enc" | "user_id">;

export const AI_INTEGRATION_PUBLIC_COLUMNS =
  "id, provider, label, model, key_hint, base_url, is_default, enabled, last_tested_at, last_test_ok, last_error, created_at, updated_at";
