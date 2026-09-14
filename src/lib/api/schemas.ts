import { z } from "zod";

const boolFromString = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");

const addressInput = z.union([
  z.string().min(3),
  z.object({ email: z.string().email(), name: z.string().nullable().optional() }),
]);

export type AddressInput = z.infer<typeof addressInput>;

export const listEmailsQuerySchema = z.object({
  account_id: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
  from: z.string().max(200).optional(),
  unread: boolFromString.optional(),
  starred: boolFromString.optional(),
  folder: z.enum(["inbox", "sent", "archive", "drafts", "trash", "spam"]).optional(),
  category: z.string().max(40).optional(),
  priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
  requires_response: boolFromString.optional(),
  thread_id: z.string().max(200).optional(),
  since: z.string().datetime({ offset: true }).optional(),
  until: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const updateEmailSchema = z
  .object({
    is_read: z.boolean().optional(),
    is_starred: z.boolean().optional(),
  })
  .refine((v) => v.is_read !== undefined || v.is_starred !== undefined, { message: "Provide is_read and/or is_starred" });

export const sendEmailSchema = z.object({
  account_id: z.string().uuid(),
  to: z.array(addressInput).min(1),
  cc: z.array(addressInput).optional(),
  bcc: z.array(addressInput).optional(),
  subject: z.string().min(1).max(500),
  body_text: z.string().max(200_000).optional(),
  body_html: z.string().max(500_000).optional(),
});

export const replyEmailSchema = z.object({
  body_text: z.string().max(200_000).optional(),
  body_html: z.string().max(500_000).optional(),
  reply_all: z.boolean().optional(),
});

export const analyzeEmailSchema = z.object({ force: z.boolean().optional() }).optional();

export const batchAnalyzeSchema = z.object({
  email_ids: z.array(z.string().uuid()).max(50).optional(),
  account_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const assistantSchema = z.object({
  message: z.string().min(1).max(20_000),
  conversation_id: z.string().uuid().optional(),
  timezone: z.string().max(64).optional(),
});

export const listEventsQuerySchema = z.object({
  account_id: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const createEventSchema = z.object({
  account_id: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).nullable().optional(),
  location: z.string().max(1000).nullable().optional(),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  timezone: z.string().max(64).optional(),
  attendees: z.array(addressInput).optional(),
  online_meeting: z.boolean().optional(),
  all_day: z.boolean().optional(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expires_in_days: z.number().int().min(1).max(3650).nullable().optional(),
});

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const syncBodySchema = z
  .object({
    account_id: z.string().uuid().optional(),
    calendar: z.boolean().optional(),
    analyze: z.boolean().optional(),
  })
  .optional();

// ---------------------------------------------------------------------------
// Profile / SaaS
// ---------------------------------------------------------------------------

export const updateMeSchema = z.object({
  full_name: z.string().max(120).nullable().optional(),
  tour_completed: z.boolean().optional(),
  onboarding: z.record(z.string(), z.unknown()).optional(),
});

const providerEnum = z.enum(["anthropic", "openai", "google", "openai_compatible"]);

export const createIntegrationSchema = z.object({
  provider: providerEnum,
  label: z.string().max(80).optional(),
  model: z.string().min(1).max(120),
  api_key: z.string().max(1000).nullable().optional(),
  base_url: z.string().max(500).nullable().optional(),
  make_default: z.boolean().optional(),
});

export const updateIntegrationSchema = z.object({
  label: z.string().max(80).optional(),
  model: z.string().min(1).max(120).optional(),
  api_key: z.string().max(1000).nullable().optional(),
  base_url: z.string().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
  make_default: z.boolean().optional(),
});

export const adminUpdateUserSchema = z.object({
  role: z.enum(["admin", "member"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  can_create_api_keys: z.boolean().optional(),
  full_name: z.string().max(120).nullable().optional(),
});

export const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).optional(),
  can_create_api_keys: z.boolean().optional(),
  expires_in_days: z.number().int().min(1).max(90).optional(),
  note: z.string().max(500).nullable().optional(),
});

export const adminSettingsSchema = z.object({
  app_name: z.string().min(1).max(60).optional(),
  allow_self_signup: z.boolean().optional(),
  allow_platform_ai: z.boolean().optional(),
  default_can_create_api_keys: z.boolean().optional(),
  invitation_expiry_days: z.number().int().min(1).max(90).optional(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8).max(200),
  full_name: z.string().max(120).nullable().optional(),
});
