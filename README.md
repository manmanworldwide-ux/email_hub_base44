# Email Hub

A multi-user SaaS inbox that unifies **Gmail and Outlook accounts** with AI analysis, an AI assistant, calendar scheduling, send/reply, invitation-based user management and a **secure REST API** for external agents such as Base44 superagent.

Stack: **Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Auth + Postgres + RLS) · LLM adapters for Anthropic, OpenAI, Google Gemini and OpenAI-compatible endpoints**. Mobile-ready UI with an interactive product tour.

## What it does

- **Accounts & access** – Sign in / sign up, invitation-only onboarding via links (no email delivery needed), admin-generated password-reset links, roles (admin / member), disable/enable users, per-user permission to generate API tokens.
- **Connect mailboxes** – OAuth for Google (Gmail + Google Calendar) and Microsoft (Outlook Mail + Calendar via Graph). Any number of accounts per user; tokens are AES-256-GCM encrypted at rest.
- **Sync & collect** – Windowed backfill (default 30 days) then incremental sync of mail and calendar events into Postgres with full-text search. Manual sync and a scheduled job (`/api/cron/sync`).
- **Bring your own LLM** – Each user picks the provider that powers analysis and the assistant: Anthropic Claude, OpenAI, Google Gemini or any OpenAI-compatible endpoint (Groq, Mistral, Ollama…). Admins can also offer a platform-wide Anthropic key as the default.
- **AI analysis** – Category, priority, sentiment, intent, summary, action items, entities, "needs a reply", suggested reply. Optional auto-analysis after each sync.
- **AI assistant** – Tool-using chat across all mailboxes: search/read emails, draft & send replies, schedule meetings, summarise the inbox. Conversations persist.
- **Send, reply, schedule** – Compose from any account, reply in-thread, create meetings with Meet/Teams links and attendee invites.
- **Dashboard, insights, onboarding** – KPIs, volume charts, category/priority/sentiment breakdowns, top senders, a getting-started checklist and a guided tour.
- **External API + access tokens** – Scoped API keys (`ehk_live_…`), OpenAPI spec, request logging. See [docs/API.md](docs/API.md).

## Project layout

```
supabase/migrations/0001_initial.sql   Core schema (accounts, emails, analyses, events, API keys, assistant)
supabase/migrations/0002_saas.sql      Roles, workspace settings, invitations, AI integrations, RLS + signup guard
src/app/(app)/*                        Dashboard, inbox, compose, calendar, assistant, insights, accounts, settings/*, admin/*
src/app/login, src/app/invite/[token]  Public auth pages
src/app/api/v1/*                       External + internal JSON API (API key or session auth)
src/app/api/auth/[provider]/*          OAuth connect flows (google | microsoft)
src/app/api/invite/*                   Public invitation validation / acceptance
src/app/api/cron/sync                  Scheduled sync (CRON_SECRET)
src/lib/auth/*                         Sessions, roles, invitations, admin user management, workspace settings
src/lib/providers/*                    Gmail & Microsoft Graph clients (mail, send, reply, calendar)
src/lib/hub/*                          Service layer: accounts, emails, calendar, sync, analytics
src/lib/ai/llm/*                       Provider-neutral LLM layer (anthropic | openai | google | openai_compatible)
src/lib/ai/*                           Structured email analysis, tool-using assistant, integrations CRUD
src/lib/api/*                          Auth (API keys / session), scopes, schemas, endpoint catalogue, OpenAPI
src/components/*                       App shell (responsive nav + tour), pages' client components, charts
docs/API.md                            API documentation for Base44 / integrators
```

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local
npm run gen:key   # run twice: TOKEN_ENCRYPTION_KEY and CRON_SECRET
```

### 2. Supabase

1. Create a project at supabase.com.
2. Run `supabase/migrations/0001_initial.sql` **then** `0002_saas.sql` in the SQL editor (or `supabase db push`).
3. Authentication → URL configuration: set the Site URL to your app URL and add `<app>/auth/callback` to redirect URLs.
4. Copy the project URL, anon key and service-role key into `.env.local`.

### 3. First administrator

The **first account that signs up becomes the administrator** (the login page shows a "Create admin" tab while no users exist). Afterwards sign-ups are blocked at the database level unless an admin enables *Allow self sign-up* or the email has a pending invitation. Optionally set `ADMIN_EMAILS=you@company.com` to always promote specific accounts.

### 4. Google OAuth (Gmail + Calendar)

1. Google Cloud Console → enable **Gmail API** and **Google Calendar API**.
2. OAuth consent screen: scopes `gmail.modify`, `calendar`, `openid`, `email`, `profile`; add test users while in testing mode.
3. Credentials → OAuth client ID (Web) → redirect URI `<app>/api/auth/google/callback`.
4. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### 5. Microsoft OAuth (Outlook Mail + Calendar)

1. Azure Portal → App registrations → New (*Accounts in any organizational directory and personal Microsoft accounts*).
2. Redirect URI (Web): `<app>/api/auth/microsoft/callback`.
3. Certificates & secrets → new client secret.
4. API permissions (Graph, delegated): `openid profile email offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite`.
5. Set `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` (`MICROSOFT_TENANT=common`).

### 6. AI

Two options that can coexist:

- **Platform AI** – set `ANTHROPIC_API_KEY` (and optionally `AI_MODEL`, default `claude-opus-5`). Users without their own provider use it. Admins can switch this off under Administration → Workspace settings.
- **Bring your own key** – each user adds a provider under Settings → AI provider (Anthropic, OpenAI, Gemini, or an OpenAI-compatible base URL), tests it, and sets it as default.

### 7. Run

```bash
npm run dev
```

## Deploying to Vercel

1. Import the repo, set every variable from `.env.example` (use your production URL for `NEXT_PUBLIC_APP_URL`).
2. Add the production redirect URIs to Google, Azure and Supabase.
3. `vercel.json` schedules `/api/cron/sync` once a day (`0 6 * * *`), which is the most a **Hobby** plan allows - a more frequent schedule makes the deployment fail. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. On a **Pro** plan change the schedule to e.g. `*/10 * * * *`; on Hobby, point an external scheduler (cron-job.org, GitHub Actions, n8n…) at `GET https://<app>/api/cron/sync` with the same bearer header for frequent syncs. Users can always press **Sync** in the UI or call `POST /api/v1/sync`.
4. Sign up once to become admin, then invite your team from **Administration → Invitations**.

## User management (admins)

- **Invitations** – generate a link (role, API-token permission, validity). Share it any way you like; the invitee opens it, sets a password and lands in the hub with the tour running. Links are one-time and can be revoked.
- **Users** – change role, toggle *API tokens* (lets a user connect AI agents), disable/enable, delete, or generate a **password-reset link** (also no email required).
- **Workspace settings** – allow self sign-up, default API-token permission, invitation validity, offer platform AI, workspace name.

## Giving Base44 (or any agent) access

1. An admin enables *API tokens* for the user (or the user is an admin).
2. The user opens **Settings → API access → Create key**, chooses scopes and expiry, and copies the `ehk_live_…` token (shown once).
3. In Base44, configure an HTTP/OpenAPI integration with base URL = your deployment and header `Authorization: Bearer <token>`; import `https://<app>/api/v1/openapi.json`.
4. Test with `GET /api/v1/me`. Full reference in [docs/API.md](docs/API.md).

## Security notes

- Row Level Security isolates every table by `user_id`; admin-only tables use an `is_admin()` policy. API-key requests use the service role but are always filtered by the key owner's `user_id`.
- Sign-ups without an invitation are rejected by a database trigger when self sign-up is off.
- OAuth tokens and AI provider keys are encrypted with `TOKEN_ENCRYPTION_KEY` and never returned by the API.
- API keys and invitation tokens are stored as SHA-256 hashes; the OAuth `state` is bound to the user with a signed cookie.
- API-key, AI-integration and admin endpoints cannot be called with an API key (interactive login only). Disabled users are banned at the auth layer and rejected by the API.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run gen:key` | Generate a 32-byte hex secret |

## Roadmap ideas

- Streaming assistant responses and push (Gmail Pub/Sub, Graph webhooks) instead of polling.
- Attachments download/preview and drafts.
- Per-user AI rules ("always mark invoices as high priority") and digest emails.
- Organisations / multiple workspaces per deployment.
