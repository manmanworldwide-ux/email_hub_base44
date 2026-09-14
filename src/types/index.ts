export type Provider = "google" | "microsoft";
export type AccountStatus = "active" | "needs_reauth" | "disabled" | "error";

export interface Address {
  name: string | null;
  email: string;
}

export interface SyncState {
  mode?: "backfill" | "incremental";
  page_token?: string | null;
  window_start?: string;
  backfill_started_at?: string;
  last_incremental_at?: string;
}

export interface ConnectedAccountRow {
  id: string;
  user_id: string;
  provider: Provider;
  provider_account_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  scopes: string[];
  sync_state: SyncState;
  last_synced_at: string | null;
  last_calendar_synced_at: string | null;
  status: AccountStatus;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountPublic {
  id: string;
  provider: Provider;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  scopes: string[];
  status: AccountStatus;
  last_error: string | null;
  last_synced_at: string | null;
  last_calendar_synced_at: string | null;
  created_at: string;
}

export const ACCOUNT_PUBLIC_COLUMNS =
  "id, provider, email, display_name, avatar_url, scopes, status, last_error, last_synced_at, last_calendar_synced_at, created_at";

export interface EmailRow {
  id: string;
  user_id: string;
  account_id: string;
  provider_message_id: string;
  thread_id: string | null;
  internet_message_id: string | null;
  in_reply_to: string | null;
  references_header: string | null;
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  to_recipients: Address[];
  cc_recipients: Address[];
  bcc_recipients: Address[];
  reply_to: string | null;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string | null;
  sent_at: string | null;
  is_read: boolean;
  is_starred: boolean;
  is_draft: boolean;
  is_sent: boolean;
  has_attachments: boolean;
  labels: string[];
  folder: string | null;
  importance: string | null;
  web_link: string | null;
  created_at: string;
  updated_at: string;
}

export const EMAIL_LIST_COLUMNS =
  "id, account_id, provider_message_id, thread_id, subject, from_name, from_email, to_recipients, snippet, received_at, is_read, is_starred, is_sent, is_draft, has_attachments, labels, folder, importance";

export type EmailListItem = Pick<
  EmailRow,
  | "id"
  | "account_id"
  | "provider_message_id"
  | "thread_id"
  | "subject"
  | "from_name"
  | "from_email"
  | "to_recipients"
  | "snippet"
  | "received_at"
  | "is_read"
  | "is_starred"
  | "is_sent"
  | "is_draft"
  | "has_attachments"
  | "labels"
  | "folder"
  | "importance"
> & {
  analysis?: Pick<EmailAnalysisRow, "category" | "priority" | "sentiment" | "summary" | "requires_response"> | null;
  account?: Pick<AccountPublic, "id" | "provider" | "email"> | null;
};

export type EmailCategory =
  | "work"
  | "personal"
  | "finance"
  | "meeting"
  | "sales"
  | "support"
  | "newsletter"
  | "promotion"
  | "notification"
  | "social"
  | "spam"
  | "other";

export type EmailPriority = "urgent" | "high" | "normal" | "low";
export type EmailSentiment = "positive" | "neutral" | "negative";

export interface ActionItem {
  text: string;
  due: string;
}

export interface EmailEntities {
  people: string[];
  organizations: string[];
  dates: string[];
  amounts: string[];
}

export interface EmailAnalysisRow {
  id: string;
  email_id: string;
  user_id: string;
  category: EmailCategory | null;
  priority: EmailPriority | null;
  sentiment: EmailSentiment | null;
  intent: string | null;
  summary: string | null;
  action_items: ActionItem[];
  entities: EmailEntities;
  requires_response: boolean;
  suggested_reply: string | null;
  language: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

export interface CalendarEventRow {
  id: string;
  user_id: string;
  account_id: string;
  provider_event_id: string;
  calendar_id: string | null;
  title: string | null;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  timezone: string | null;
  all_day: boolean;
  attendees: EventAttendee[];
  organizer_email: string | null;
  organizer_name: string | null;
  status: string | null;
  meeting_link: string | null;
  web_link: string | null;
  created_by_hub: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventAttendee {
  email: string;
  name: string | null;
  response: string | null;
}

export interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export type ApiKeyPublic = Omit<ApiKeyRow, "key_hash" | "user_id">;

export interface AssistantConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface AssistantMessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: unknown;
  display_text: string | null;
  created_at: string;
}

export interface SyncLogRow {
  id: string;
  user_id: string;
  account_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  emails_synced: number;
  events_synced: number;
  analyses_run: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Provider-normalized shapes
// ---------------------------------------------------------------------------

export interface NormalizedEmail {
  provider_message_id: string;
  thread_id: string | null;
  internet_message_id: string | null;
  in_reply_to: string | null;
  references_header: string | null;
  subject: string;
  from_name: string | null;
  from_email: string | null;
  to_recipients: Address[];
  cc_recipients: Address[];
  bcc_recipients: Address[];
  reply_to: string | null;
  snippet: string;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  sent_at: string | null;
  is_read: boolean;
  is_starred: boolean;
  is_draft: boolean;
  is_sent: boolean;
  has_attachments: boolean;
  labels: string[];
  folder: string | null;
  importance: string | null;
  web_link: string | null;
}

export interface NormalizedEvent {
  provider_event_id: string;
  calendar_id: string | null;
  title: string | null;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  timezone: string | null;
  all_day: boolean;
  attendees: EventAttendee[];
  organizer_email: string | null;
  organizer_name: string | null;
  status: string | null;
  meeting_link: string | null;
  web_link: string | null;
}

export interface TokenSet {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string[];
}

export interface ProviderProfile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

export interface SendMailParams {
  fromName: string | null;
  fromEmail: string;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  text: string | null;
  html: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  threadId?: string | null;
}

export interface CreateEventParams {
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  timezone: string;
  attendees: Address[];
  onlineMeeting: boolean;
  allDay: boolean;
}

export interface ListMessagesPage {
  messages: NormalizedEmail[];
  nextPageToken: string | null;
}
