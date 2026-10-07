# SAKSHA

A privacy-first workflow management platform for small Chartered Accountant (CA) firms. It connects clients, recurring work, staff, deadlines, review and history in one place.

> CA Office OS manages the work **around** the CA. It does not calculate tax, file returns or give professional advice.

**Status:** Feature complete and demonstrable. Built as a 4-week internship project, 12 Sep – 7 Oct 2026.

## Features

| Area | What it does |
|---|---|
| Authentication | Email/password sign-in, session refresh, route protection. Accounts created by the firm must replace their temporary password before any data is visible to them. |
| Roles | CA/Admin, Staff and Client, each with its own navigation and dashboard |
| Clients | List, search, filter, add, edit, deactivate; optional portal login |
| Staff | Add, deactivate, assign to and remove from clients |
| Tasks | Create, filter, reassign, enforced status transitions, derived overdue badge |
| **Workflow templates** | Describe a service cycle once; generate the whole task list for one client and one period in a single step, with dates derived from per-step day offsets |
| **Documents** | Request a file, upload direct to private storage with a progress bar, review and accept or reject with a reason, full version history. An accepted version can never be deleted. |
| **Messaging** | One conversation per client, shared by the firm; messages are immutable once sent |
| **Notifications** | Raised by database triggers, not by application code |
| **AI assistant** | Answers questions from the firm's own records. Chooses one of four actions; the application runs the query. Falls back to keyword rules when the model is unavailable. |
| Activity log | Every business action is recorded; entries cannot be edited or deleted, even by the database owner |
| Dashboards | CA: attention summary, client work, team workload. Staff: personal queues. Client: work status and pending items. |

### Design decisions worth noting

- **Permissions live in the database, not in the application.** 17 row-level security policies govern reads. There are **no write policies at all** — every change goes through one of 26 `SECURITY DEFINER` functions that check the rules and write the audit log in the same transaction.
- **Tenant isolation is structural.** Composite foreign keys `(client_id, firm_id)` make a cross-firm row impossible to store, rather than merely forbidden.
- **The AI cannot invent data.** Every client or staff name the model returns is validated against the real list and dropped if unknown; the application, not the model, runs the query.
- **Nothing derived is stored.** Overdue state, progress and counts are computed, never persisted.

### Not built (deliberately deferred)

Pagination, full-text search, email delivery, self-service password reset, automated test runner, and payments. See `docs/learn/10-build-from-scratch.md` for why each was deferred.

## Tech stack

- **Next.js 15** (App Router, Server Components, Server Actions), TypeScript
- **Supabase**: PostgreSQL, Auth, Row Level Security (Storage comes with the document module)
- **Zod** for form validation
- Plain CSS with design tokens (light and dark mode)

## Architecture

```text
Browser
  │  (no secrets, no direct table writes)
  ▼
Next.js server
  ├─ middleware.ts ............ refreshes session, redirects signed-out users
  ├─ Server Components ........ read data as the signed-in user (RLS applies)
  ├─ Server Actions ........... validate input (zod), then call database functions
  └─ lib/accounts.ts .......... service-role client, ONLY for creating logins
  │
  ▼
Supabase
  ├─ Auth ..................... email + password
  ├─ RLS policies ............. who can READ which rows
  └─ SECURITY DEFINER functions  every WRITE: permission check + business rule
                                 + activity log, in one transaction
```

### Security model

The security rules live in the database, so they hold even if someone bypasses the UI and calls the API directly.

1. **Reads are filtered by RLS.** Admins see their whole firm. Staff see only the clients assigned to them and their own tasks. Clients see only their own records. Another firm's data is never visible.
2. **Signed-in users cannot write to tables directly.** Insert, update and delete grants are revoked. Every change goes through a database function such as `change_task_status()`.
3. **Each function checks permissions and business rules, then logs the action**, all in one transaction. Examples: only the CA approves reviewed work, invalid status moves are rejected, and staff can't be removed from a client while they still have open tasks there.
4. **Inactive users, and users still on a temporary password, resolve to "no firm".** They can read nothing, even with a valid session.
5. **The service-role key never reaches the browser.** `lib/supabase/admin.ts` imports `server-only`, so the build fails if client code imports it.
6. **Activity logs are append-only.** A trigger blocks updates and deletes, even for the database owner.

### Business rules implemented

These decisions close gaps found while reviewing the project plan:

- **Overdue status is calculated, never stored.** A task is overdue when its due date has passed and it isn't completed or cancelled.
- **Tasks have a `requires_review` flag.** When it's set, staff must submit the task for review, and only the CA can complete it.
- **A task can only be assigned to staff who are assigned to that task's client.**
- **Removing staff from a client is blocked while they have open tasks for that client.**
- **Deactivating a client also disables that client's portal login.** All history is kept.
- **Due dates are stored as 5:00 PM IST** and always displayed in `Asia/Kolkata`.

## Project structure

```text
app/
  login/, change-password/, auth/signout/   authentication
  (app)/                                    protected area (shared layout + sidebar)
    dashboard/     role-based dashboards
    clients/       list, detail, new, edit, server actions
    staff/         staff management
    tasks/         list, detail, new, server actions
    activity/      firm activity log
    work/, profile/  client portal pages
    [module]/      placeholders for upcoming modules
components/        shared UI (tables, badges, timeline, forms)
lib/
  auth.ts          getCurrentUser / requireUser guard
  accounts.ts      login provisioning (service role, with rollback)
  tasks.ts         status labels and transition rules (UI mirror)
  validation.ts    zod schemas
  supabase/        server, middleware and admin clients
supabase/
  migrations/      schema, RLS policies, database functions
  tests/           SQL authorization checks
  reset_demo.sql   remove demo data
scripts/seed.mjs   create demo data
```

## Workflows (migration 2)

A **workflow template** describes one service cycle once: an ordered list of steps,
each of which can need a client document, need CA review, and fall a few days after
the cycle's first due date.

**Generating** a workflow for a client, financial year and period creates a
`workflow_runs` row plus one task per step, all in one database transaction.
Step titles are copied into the tasks, so editing a template later never rewrites
work that already exists.

Guard rails, all enforced in the database:

- The same client + service + financial year + period cannot be generated twice by
  accident. The CA sees the warning and must tick "create another workflow".
- Closing a run with unfinished tasks asks for confirmation and records how many
  were still open. Nothing is silently marked complete.
- Cancelling a run also cancels the tasks in it that nobody finished.
- Templates are archived, never deleted, and archiving one leaves existing runs alone.

## Documents (migration 3)

A **document request** is what the firm needs from a client ("September bank statement").
Each upload against it is a **version** in private storage; the request itself is never
re-created.

- Files go to the private `client-documents` bucket. Storage policies reuse
  `app_can_view_client()`, so a client cannot reach another client's folder even with
  the exact path, and nothing is ever public.
- Paths are `<client_id>/<request_id>/<random>.<ext>` — built from ids and an allowed
  extension, never from the uploaded file name.
- Downloads go through `/documents/download/<id>`, which checks the row with RLS and
  then issues a 60-second signed URL.
- Rejecting requires a reason. The client uploads version 2 against the same request
  (`REJECTED → UPLOADED`), and only the newest version can be reviewed, once.
- Generating a workflow also creates a document request for every template step marked
  "needs document", linked to the task it blocks.

## Messages (migration 4)

One thread per client: the firm on one side, the client on the other, with an optional
link to the task a message is about.

- `messages` rows are immutable — a trigger blocks update and delete, so a sent message
  stays part of the record.
- `send_message()` re-checks the sender's relationship to the client, rejects inactive
  clients, caps messages at 2000 characters, and refuses a task that belongs to someone
  else's client.
- Clients see "Your CA firm" rather than which staff member wrote, matching how the
  activity timeline already behaves.
- Deliberately out of scope (plan §45): attachments, reactions, sub-threads, read
  receipts, group chats. Files go through document requests.

## Notifications (migration 5)

Generated by database triggers rather than by the app, so a new screen that calls an
existing function cannot forget to create them.

- `notifications` — one row per person: firm_id, user_id, title, message, entity_type
  (`client / task / document_request / workflow / message`), entity_id, read.
- Triggers: a task assigned to you, work moving to `UNDER_REVIEW` (the CA), a document
  requested (the client), uploaded (the firm), accepted or rejected (the client), and a
  new message (the other side).
- `app_notify()` never notifies you about your own action, and skips users who are
  inactive or still on a temporary password.
- RLS: you can read only your own rows; `mark_notification_read()` and
  `mark_all_notifications_read()` only touch the caller's.
- The sidebar shows an unread count; opening `/notifications/<id>` marks that one read
  and forwards to the record it is about.
- Out of scope (plan §99–100): email, SMS, WhatsApp, scheduled overdue jobs. Overdue
  stays a derived value on the dashboard.

## AI assistant (no migration)

An assistant that writes three summaries, drafts client reminders, answers questions
about the firm's own records, and turns plain-English searches into validated filters.

### Provider-independent

`lib/ai.ts` speaks to either backend, chosen by `AI_PROVIDER`:

| Provider | Use | Config |
|---|---|---|
| `ollama` (default) | Development and any demo with real data. Nothing leaves the machine. | `AI_BASE_URL`, `AI_MODEL` |
| `openai` | Any OpenAI-compatible endpoint — Groq, OpenRouter, Gemini's compatibility layer, Cerebras, GitHub Models — so a deployed demo works without Ollama installed. | `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` |

The application code never knows which answered. The key is read server-side only and is
never exposed to the browser.

### What the model is allowed to see

Only the structured summary built in `lib/ai-context.ts`: task, document-request and
workflow metadata for the signed-in user's firm, read through RLS. Never file contents,
message text, PAN or GSTIN, or another firm's data.

### Natural-language search

```text
question -> model -> JSON filters -> validation -> our query -> rows
```

The model never writes SQL and never reaches the database. It proposes filters; they are
checked against a fixed schema *and* against the firm's own client, service and staff
lists, and anything unrecognised is dropped and reported on screen. The query is then run
by the app under RLS. With no model at all, the same question is read by keyword rules,
so the feature still works.

### Failure is handled, not hidden

Model off, slow (45s timeout), empty, unpulled, rate-limited or a rejected key: the page
says which, and still shows the underlying records. Reminders are drafted, never sent.

Set up a local model:

```bash
# install Ollama from ollama.com, then
ollama pull llama3.2
```

## Setup

### 1. Prerequisites

- Node.js 20.6 or newer
- Git
- A free Supabase project from [supabase.com](https://supabase.com)

### 2. Install

```bash
git clone <your-repo-url> ca-office-os
cd ca-office-os
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local` from **Supabase Dashboard → Project Settings → API**:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (keep secret) |
| `DEMO_PASSWORD` | Any password of 8+ characters, used for all demo accounts |

`.env.local` is gitignored. Only `.env.example` is committed.

### 4. Create the database

Open **Supabase Dashboard → SQL Editor**, paste the contents of `supabase/migrations/20260916000001_foundation.sql`, and run it.

If you use the Supabase CLI instead:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

### 5. Load demo data

```bash
npm run seed
```

This creates the fictitious firm "Sharma & Associates", four clients, three staff members, tasks in different states, and a second firm for isolation tests. It prints the demo logins. Every demo account uses your `DEMO_PASSWORD`.

To start over, run `supabase/reset_demo.sql` in the SQL editor, then run `npm run seed` again.

### 6. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Demo accounts

| Role | Email | Notes |
|---|---|---|
| CA / Admin | anil@sharma-associates.test | Full firm access |
| Staff | rahul@sharma-associates.test | Assigned to ABC Traders and XYZ Pvt Ltd |
| Staff | priya@sharma-associates.test | Assigned to XYZ Pvt Ltd and Om Services |
| Client | rajesh@abctraders.test | Must change password on first sign-in |
| Client | meera@xyzpvt.test | Normal client login |
| Other firm | neha@kapoor-co.test | Used to show tenant isolation |

## Testing

### Authorization tests (database level)

After seeding, open `supabase/tests/rls_checks.sql` in the SQL editor and run it. Each block impersonates a user and has an `EXPECT` comment describing the correct result. The checks cover:

- staff client visibility
- client isolation
- cross-firm isolation
- the temporary-password lockout
- refused direct writes
- the CA-only approval rule
- invalid status transitions
- admin-only operations
- activity log immutability

### Manual checks in the app

1. **Direct URL access.** Sign in as Rahul and open `/clients/<Om Services id>`. You should see "You do not have permission".
2. **First sign-in.** Sign in as Rajesh. You should be sent to the password change page, and you shouldn't be able to reach `/dashboard` until the password is changed.
3. **Review rule.** As Rahul, open "Prepare GST data". No approve button should be shown. As Anil, approve it.
4. **Deactivation.** Deactivate XYZ Pvt Ltd as Anil, then try to sign in as Meera. The sign-in should be refused.
5. **Staff removal guard.** Try to remove Priya from Om Services. The removal should be blocked because she has open tasks there.

### Type check

```bash
npm run typecheck
```

## Known limitations

These are intentional scope limits for the MVP:

- **No automated onboarding emails or self-service password reset.** The CA shares temporary credentials outside the app.
- **Workflows, documents, messaging, notifications and AI are not built yet** (see Planned).
- **No tax, GST or filing logic.** This is a permanent product boundary.
- **Search uses simple database filters**, not full-text or semantic search.
- **Lists are not paginated yet.** This is fine for demo-sized data.

## Security notes

- Never commit `.env.local` or the service-role key.
- The seed data is fictitious. Do not upload real client documents.
- Hiding a button in the UI is not treated as security. Every rule is enforced by RLS or a database function.

### Keeping the assistant honest in production

| Concern | What the app does |
| --- | --- |
| Runaway replies burning a free-tier quota | `AI_MAX_TOKENS` (default 700) caps every request, on both providers. |
| A model name being retired, or a rate limit | `AI_MODEL_FALLBACK` is tried once when the main model 404s, rate-limits, times out or errors. A rejected API key is not retried, because the second call would fail the same way. |
| "Why did it answer that?" months later | Each stored answer keeps the model, the latency, the prompt version and whether the backup answered. The AI page shows that line under every reply; the server log carries one `[ai]` line per message. |
| A prompt edit quietly breaking routing | `npm run eval:ai` runs 18 real messages — including misspelt ones — against the configured model and reports a pass rate. It exits non-zero below `AI_EVAL_THRESHOLD` (default 0.85). Run it before and after any prompt change. |
| Changing a prompt without saying so | `PROMPT_VERSION` in `lib/ai.ts`. Bump it whenever prompt wording changes materially; it is stored with every answer from then on. |

```bash
npm run eval:ai              # evaluate the configured model
npm run eval:ai -- --fallback  # evaluate the backup model instead
```
