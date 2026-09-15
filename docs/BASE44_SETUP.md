# Connecting Base44 (or any AI agent) to Email Hub

Email Hub exposes a REST API secured with access tokens. Give an agent the token and one of the
three descriptions below and it can monitor mailboxes and calendars, search and read email,
and (if you allow the write scopes) reply, send and schedule.

## 1. Create the token

Email Hub → **Settings → API access** → **Create key**.

- Name: `Base44`
- Scopes for monitoring: `accounts:read`, `emails:read`, `calendar:read`, `analytics:read`, `ai:use`, `sync:trigger`
- Add `emails:write` / `calendar:write` only if the agent should reply, send or book meetings.

Copy the `ehk_live_…` token - it is shown once. Revoke it from the same page whenever you like.

## 2. Give Base44 the API description (pick whichever its UI offers)

### Option A - OpenAPI URL (best)
If Base44 has an "Import API / OpenAPI / Swagger" field, paste:

```
https://email-hub-base44.vercel.app/api/v1/openapi.json
```

When it asks for authentication choose **Bearer token** (HTTP bearer) and paste the `ehk_live_…` token.
Some tools call this "API key in header": header name `Authorization`, value `Bearer ehk_live_…`.

### Option B - OpenAPI file upload
Upload `docs/openapi.json` from this repository (a saved copy of the URL above). Re-export it after
API changes with:

```
curl -s https://email-hub-base44.vercel.app/api/v1/openapi.json > docs/openapi.json
```

### Option C - No OpenAPI import: paste this into the agent's instructions / knowledge

```
You can access the user's Email Hub (a unified Gmail + Outlook inbox with calendars) through a REST API.

Base URL: https://email-hub-base44.vercel.app
Authentication: send the header  Authorization: Bearer <TOKEN>  on every request.
Every response is JSON: {"ok":true,"data":...,"meta":{...}} or {"ok":false,"error":{"code":"...","message":"..."}}.
Timestamps are ISO 8601 (UTC). Ids are UUIDs. Lists are newest first.

Endpoints:
- GET  /api/v1/me                       verify access (user, role, scopes)
- GET  /api/v1/accounts                 connected mailboxes: id, provider (google|microsoft), email, display_name, status.
                                        meta.total is the number of mailboxes - list EVERY item by its email address
                                        (several mailboxes can share the same display_name).
- GET  /api/v1/emails                   search/list. Query params: q (text), from (sender), unread=true, starred=true,
                                        folder (inbox|sent|archive), category, priority (urgent|high|normal|low),
                                        requires_response=true, account_id, since, until (ISO), limit (max 100), offset.
                                        Items: id, subject, from_name, from_email, received_at, is_read, snippet,
                                        account{email,provider}, analysis{category,priority,sentiment,summary,requires_response}.
                                        meta.total is the total match count.
- GET  /api/v1/emails/{id}              full email: body_text, body_html, to/cc, analysis, thread[]
- PATCH /api/v1/emails/{id}             {"is_read":true|false,"is_starred":true|false}
- POST /api/v1/emails/{id}/analyze      run AI analysis on one email (category, priority, summary, action_items, suggested_reply)
- POST /api/v1/ai/analyze               {"limit":20} analyse newest un-analysed emails
- POST /api/v1/emails/{id}/reply        {"body_text":"...","reply_all":false}   (only when the user explicitly asks)
- POST /api/v1/emails/send              {"account_id":"...","to":["a@b.com"],"subject":"...","body_text":"..."}  (only when asked)
- GET  /api/v1/calendar/events          ?from=ISO&to=ISO&account_id=  events in a range: id, title, start_at, end_at,
                                        location, meeting_link, attendees[], account{email}
- GET  /api/v1/calendar/upcoming        ?within_minutes=30&refresh=true&include_in_progress=false
                                        events starting soon, soonest first, each with minutes_until_start.
                                        refresh=true pulls the latest from Google/Microsoft first. Use for reminders.
- POST /api/v1/calendar/events          {"account_id":"...","title":"...","start":ISO,"end":ISO,"timezone":"Asia/Manila",
                                        "attendees":["a@b.com"],"online_meeting":true}  (only when asked)
- GET  /api/v1/analytics/summary        ?days=7 totals (unread, received, needs reply, upcoming), category/priority/sentiment
                                        breakdowns, top senders, per-account counts
- POST /api/v1/sync                     pull new mail + calendar for all mailboxes now (up to 60 seconds)
- POST /api/v1/ai/assistant             {"message":"...","timezone":"Asia/Manila","conversation_id":"..."}
                                        Email Hub's own assistant; it can search, summarise, draft, reply and schedule.

Rules:
- Always call the API for current data when the user asks about accounts, emails or events. Never answer
  from an earlier result - mailboxes, emails and events change all the time.
- When listing mailboxes, enumerate every item in data by email address and state meta.total.
- Never send email or create calendar events unless the user explicitly asked for that action.
- For "today"/"tomorrow" compute from/to in the user's timezone and pass ISO timestamps.
- Count emails with meta.total; count events with the length of data.
- If a call returns ok:false, tell the user the error message; code needs_reauth means a mailbox must be reconnected in Email Hub.
```

## 3. Test

Ask the agent: "Call GET /api/v1/me on Email Hub and tell me what it returns." You should see your
user id, role and the scopes chosen above.

## 4. Useful automations

| Goal | What the agent does |
|---|---|
| Remind me 30 minutes before meetings | Every 5 min: `GET /api/v1/calendar/upcoming?within_minutes=30&refresh=true&include_in_progress=false`; notify once per event id |
| Keep mail fresh (Hobby plan syncs once a day) | Every 15-30 min: `POST /api/v1/sync` |
| Morning briefing | `GET /api/v1/analytics/summary?days=1`, `GET /api/v1/emails?unread=true&limit=20`, `GET /api/v1/calendar/events?from=<today>&to=<tonight>` |
| Flag emails that need a reply | `GET /api/v1/emails?requires_response=true&unread=true` (requires AI analysis to have run) |

## 5. Example prompts once connected

- "How many unread emails do I have across all accounts, and which are urgent?"
- "What meetings do I have today? Include the join links."
- "Summarise everything from meny@roosterpartners.com this week."
- "Remind me 30 minutes before each meeting." (needs a scheduled automation - see above)
- "Draft a reply to the latest invoice email, but don't send it."
