# Email Hub API

Base URL: `https://<your-deployment>` (locally `http://localhost:3000`).
Machine-readable spec: `GET /api/v1/openapi.json` (OpenAPI 3.1, importable into Base44, Postman, etc.).

## Authentication

Create an access token in **Settings → API access** in the Email Hub UI. Tokens look like `ehk_live_…`, are shown once, and only a SHA-256 hash is stored.

Send it on every request either way:

```
Authorization: Bearer ehk_live_...
x-api-key: ehk_live_...
```

Each key carries scopes. A request to an endpoint whose scope the key lacks returns `403 insufficient_scope`.

| Scope | Grants |
|---|---|
| `accounts:read` | List connected mailboxes |
| `accounts:write` | Disconnect mailboxes |
| `emails:read` | Read/search emails and their AI analysis |
| `emails:write` | Send, reply, mark read/starred |
| `calendar:read` | Read calendar events |
| `calendar:write` | Create and cancel meetings |
| `ai:use` | Run AI analysis and the AI assistant |
| `analytics:read` | Analytics summaries |
| `sync:trigger` | Trigger mailbox sync |

Interactive clients may instead send a Supabase user access token (`Authorization: Bearer <jwt>`); those get every scope. API-key management, AI-integration and admin endpoints are interactive-only.

Token generation must be enabled for the user by an administrator (Administration → Users → *API tokens*); administrators can always create tokens. Disabled accounts are rejected with `403 account_disabled`.

## Response envelope

```json
{ "ok": true, "data": ..., "meta": { "total": 120, "limit": 25, "offset": 0 } }
{ "ok": false, "error": { "code": "not_found", "message": "Email not found" } }
```

Common codes: `unauthorized`, `invalid_api_key`, `api_key_expired`, `insufficient_scope`, `validation_error` (422, includes `details`), `not_found`, `needs_reauth` (409, mailbox must be reconnected in the UI), `ai_not_configured` (503), `ai_rate_limited` (429).

## Endpoints

### Auth / meta
| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/api/v1/me` | `accounts:read` | Verify the key: user, role, permissions, auth method, scopes |
| PATCH | `/api/v1/me` | interactive | `{ full_name?, tour_completed?, onboarding? }` |
| GET | `/api/v1/openapi.json` | public | OpenAPI spec |
| GET | `/api/health` | public | Health + which providers/AI are configured |

### Accounts & sync
| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/api/v1/accounts` | `accounts:read` | Connected Gmail/Outlook mailboxes with status and last sync |
| GET | `/api/v1/accounts/{id}` | `accounts:read` | One mailbox |
| DELETE | `/api/v1/accounts/{id}` | `accounts:write` | Disconnect (deletes its synced data) |
| POST | `/api/v1/accounts/{id}/sync` | `sync:trigger` | Sync one mailbox now |
| POST | `/api/v1/sync` | `sync:trigger` | Sync all mailboxes. Body (optional): `{ account_id?, calendar?, analyze? }` |

Connecting a mailbox is done in the UI (OAuth): `/api/auth/google`, `/api/auth/microsoft`.

### Emails
| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/api/v1/emails` | `emails:read` | Unified list, newest first. Query: `account_id, q, from, unread, starred, folder, category, priority, requires_response, thread_id, since, until, limit (≤100), offset` |
| GET | `/api/v1/emails/{id}` | `emails:read` | Full email + `analysis` + `thread` |
| PATCH | `/api/v1/emails/{id}` | `emails:write` | `{ is_read?, is_starred? }` (synced to the mailbox) |
| POST | `/api/v1/emails/send` | `emails:write` | `{ account_id, to[], cc[]?, bcc[]?, subject, body_text?, body_html? }` |
| POST | `/api/v1/emails/{id}/reply` | `emails:write` | `{ body_text?, body_html?, reply_all? }` – sent from the receiving mailbox, thread preserved |
| POST | `/api/v1/emails/{id}/analyze` | `ai:use` | `{ force? }` – returns the AI analysis (cached unless forced) |

Addresses may be plain strings (`"jane@example.com"`, `"Jane <jane@example.com>"`) or objects (`{ "email", "name" }`).

`folder` values: `inbox`, `sent`, `archive`, `drafts`, `trash`, `spam`. Without a folder filter, trash and spam are excluded.

### AI
| Method | Path | Scope | Description |
|---|---|---|---|
| POST | `/api/v1/ai/analyze` | `ai:use` | Batch analysis: `{ email_ids[]? , account_id?, limit? }` (defaults to newest un-analysed) |
| POST | `/api/v1/ai/assistant` | `ai:use` | `{ message, conversation_id?, timezone? }` → `{ conversation_id, reply, tool_calls[], usage }` |
| GET | `/api/v1/ai/conversations` | `ai:use` | Conversation list |
| GET | `/api/v1/ai/conversations/{id}` | `ai:use` | Messages of a conversation |

Analysis fields: `category` (work, personal, finance, meeting, sales, support, newsletter, promotion, notification, social, spam, other), `priority` (urgent/high/normal/low), `sentiment`, `intent`, `summary`, `action_items[{text,due}]`, `entities{people,organizations,dates,amounts}`, `requires_response`, `suggested_reply`, `language`.

The assistant can call these tools on the user's behalf: `list_accounts`, `search_emails`, `get_email`, `analyze_email`, `send_email`, `reply_to_email`, `mark_email`, `list_calendar_events`, `create_calendar_event`, `get_inbox_summary`. Pass `conversation_id` back to keep context between turns. The response includes `provider` and `model` (the user's configured LLM or the platform default).

#### AI provider integrations (interactive only)
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/ai/providers` | Supported providers, suggested models, platform AI availability |
| GET | `/api/v1/ai/integrations` | The user's configured providers (keys never returned) |
| POST | `/api/v1/ai/integrations` | `{ provider: anthropic|openai|google|openai_compatible, model, api_key?, base_url?, label?, make_default? }` |
| PATCH | `/api/v1/ai/integrations/{id}` | `{ label?, model?, api_key?, base_url?, enabled?, make_default? }` |
| DELETE | `/api/v1/ai/integrations/{id}` | Remove |
| POST | `/api/v1/ai/integrations/{id}/test` | Sends a tiny prompt; returns `{ ok, latency_ms, model }` or `{ ok: false, error }` |

If the user has no enabled integration and the admin allows platform AI, requests fall back to the server's Anthropic key. Otherwise AI endpoints return `503 ai_not_configured`.

### Calendar
| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/api/v1/calendar/events` | `calendar:read` | Query: `account_id, from, to, limit` (defaults now → +30 days) |
| POST | `/api/v1/calendar/events` | `calendar:write` | `{ account_id, title, start, end, timezone?, attendees[]?, description?, location?, online_meeting? (default true), all_day? }` |
| DELETE | `/api/v1/calendar/events/{id}` | `calendar:write` | Cancel (notifies attendees) |

`start`/`end` are ISO 8601 with offset. Google events get a Meet link, Outlook events a Teams link, when `online_meeting` is true.

### Analytics
| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/api/v1/analytics/summary?days=30` | `analytics:read` | Totals, category/priority/sentiment breakdown, daily volume, top senders, per-account stats |

### API keys (interactive only)
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/api-keys` | List keys (hashes never returned) |
| POST | `/api/v1/api-keys` | `{ name, scopes[]?, expires_in_days? }` → includes `token` once |
| DELETE | `/api/v1/api-keys/{id}` | Revoke |

### Administration (admins, interactive only)
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/admin/users` | Users with role, status, API-token permission, last sign-in, usage counts |
| PATCH | `/api/v1/admin/users/{id}` | `{ role?, status?, can_create_api_keys?, full_name? }` |
| DELETE | `/api/v1/admin/users/{id}` | Delete user and all data |
| POST | `/api/v1/admin/users/{id}/reset-link` | Password-reset link (valid 2 days, no email sent) |
| GET | `/api/v1/admin/invitations` | Invitation / reset link history |
| POST | `/api/v1/admin/invitations` | `{ email, role?, can_create_api_keys?, expires_in_days?, note? }` → includes `url` once |
| DELETE | `/api/v1/admin/invitations/{id}` | Revoke a pending link |
| GET | `/api/v1/admin/settings` | Workspace settings |
| PATCH | `/api/v1/admin/settings` | `{ app_name?, allow_self_signup?, allow_platform_ai?, default_can_create_api_keys?, invitation_expiry_days? }` |

Public invitation endpoints used by the invite page: `GET /api/invite/{token}` (validity check) and `POST /api/invite/accept` (`{ token, password, full_name? }`).

## Examples

```bash
TOKEN=ehk_live_...
BASE=https://hub.example.com

# Verify
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/v1/me

# Unread, urgent emails from the last day
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/v1/emails?unread=true&priority=urgent&since=$(date -u -d '-1 day' +%FT%TZ)"

# Ask the assistant
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"message":"Summarise what needs my attention today","timezone":"Europe/London"}' \
  $BASE/api/v1/ai/assistant

# Reply
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"body_text":"Thanks, confirmed for Tuesday."}' \
  $BASE/api/v1/emails/<email-id>/reply

# Schedule a meeting
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"account_id":"<account-id>","title":"Kickoff","start":"2026-09-15T10:00:00+01:00","end":"2026-09-15T10:30:00+01:00","attendees":["jane@example.com"]}' \
  $BASE/api/v1/calendar/events
```

## Scheduled sync

`GET|POST /api/cron/sync` with `Authorization: Bearer <CRON_SECRET>` syncs every active mailbox for all users (used by `vercel.json` every 10 minutes). Use any external scheduler if not on Vercel.
