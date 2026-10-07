# SAKSHA — CA Management System

A privacy-first workflow management platform for small Chartered Accountant (CA) firms. It connects clients, recurring work, staff, deadlines, review and history in one place.

> SAKSHA manages the work **around** the CA. It does not calculate tax, file returns or give professional advice.

**Status:** Feature complete, tested, and ready to deploy. Built as a 4-week internship project, 12 Sep – 7 Oct 2026.

## Features

| Area | What it does |
|---|---|
| Authentication | Email/password sign-in, session refresh, route protection. Accounts created by the firm must replace their temporary password before any data is visible to them. Anyone can reset a forgotten password by email. |
| Roles | CA/Admin, Staff and Client, each with its own navigation and dashboard |
| Clients | List, search, filter, add, edit, deactivate; optional portal login |
| Staff | Add, deactivate, assign to and remove from clients |
| Tasks | Create, filter, reassign, enforced status transitions, derived overdue badge |
| **Workflow templates** | Describe a service cycle once; generate the whole task list for one client and one period in a single step, with dates derived from per-step day offsets |
| **Documents** | Request a file, upload direct to private storage with a progress bar, review and accept or reject with a reason, full version history. An accepted version can never be deleted. |
| **Messaging** | One conversation per client, shared by the firm; messages are immutable once sent |
| **Notifications** | Raised by database triggers, not by application code. A daily email digest, plus "due soon" and "overdue" reminders; each person can switch email off. |
| **AI assistant** | Answers questions from the firm's own records. Chooses one of four actions; the application runs the query. Falls back to keyword rules when the model is unavailable. |
| Lists | Every long list (clients, tasks, documents, activity, notifications) is paginated, so a firm with thousands of records stays fast |
| Activity log | Every business action is recorded; entries cannot be edited or deleted, even by the database owner |
| Dashboards | CA: attention summary, client work, team workload. Staff: personal queues. Client: work status and pending items. |

### Design decisions worth noting

- **Permissions live in the database, not in the application.** 17 row-level security policies govern reads. There are **no write policies at all** — every change goes through one of 26 `SECURITY DEFINER` functions that check the rules and write the audit log in the same transaction.
- **Tenant isolation is structural.** Composite foreign keys `(client_id, firm_id)` make a cross-firm row impossible to store, rather than merely forbidden.
- **The AI cannot invent data.** Every client or staff name the model returns is validated against the real list and dropped if unknown; the application, not the model, runs the query.
- **Nothing derived is stored.** Overdue state, progress and counts are computed, never persisted.

### Not built (deliberately deferred)

Payments (out of scope for this product) and full-text search. Pagination, email delivery, self-service password reset and an automated test runner were deferred at first and are now built.

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
  login/, forgot-password/, reset-password/ authentication
  change-password/, auth/                   first sign-in, email-link callback, sign-out
  api/health, api/cron/notify               uptime check, daily reminders and email
  (app)/                                    protected area (shared layout + sidebar)
    dashboard/     role-based dashboards
    clients/       list, detail, new, edit, server actions
    staff/         staff management
    tasks/         list, detail, new, server actions
    activity/      firm activity log
    work/, profile/  client portal pages
    [module]/      placeholders for upcoming modules
components/        shared UI (tables, badges, timeline, forms, pager)
lib/
  auth.ts          getCurrentUser / requireUser guard
  accounts.ts      login provisioning (service role, with rollback)
  tasks.ts         status labels and transition rules (UI mirror)
  validation.ts    zod schemas
  pagination.ts    page numbers and ranges for every list
  email.ts, email-digest.ts   sending and building notification emails
  supabase/        server, middleware and admin clients
supabase/
  migrations/      schema, RLS policies, database functions
  tests/           SQL authorization checks
tests/             automated unit tests (npm test)
  reset_demo.sql   remove demo data
scripts/seed.mjs   create demo data
scripts/create-firm.mjs   create a real firm and its first CA login
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
git clone <your-repo-url> saksha-ca-management
cd saksha-ca-management
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

Open **Supabase Dashboard → SQL Editor** and run **every file in `supabase/migrations/`, in filename order** (the first is `20260916000001_foundation.sql`, the last is `20260924000008_email_and_reminders.sql`). Each is safe to run once; the last one is also safe to run again.

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

### Automated tests

```bash
npm test          # unit tests: validation, permissions, dates, pagination, emails
npm run typecheck # TypeScript, strict mode
npm run check     # typecheck + tests + production build, the same as CI
```

The tests cover the rules that must never silently break: PAN, GSTIN and phone validation, the task status/permission matrix, India-time financial years and due dates, pagination maths, the open-redirect guard on email links, and the escaping of user text in emails. GitHub Actions runs `npm run check` on every push (`.github/workflows/ci.yml`).

### Before real clients use it

Work through this once on the deployed site. It takes about twenty minutes.

1. **Create the firm** (see *Deploying*) and sign in as the CA. You are asked for a new password.
2. **Forgot password:** sign out, use *Forgot your password?*, open the emailed link, set a password, sign in with it.
3. **Add a staff member and a client with a portal login.** Sign in as each in a private window and confirm each sees only their own data.
4. **Generate a workflow** for the client and confirm the dated tasks appear.
5. **Request a document** as the CA; upload it as the client; accept it as the CA. Try opening the file from a second client's account (it must be refused).
6. **Send a message each way** and confirm a notification appears for the other side.
7. **Email:** run the cron once by hand (see *Deploying*) and confirm the digest arrives.
8. **Run `supabase/tests/rls_checks.sql`** against a copy of the data and compare every block with its `EXPECT` line.
9. **Open `/api/health`.** It should answer `{"ok":true}`.

## Deploying

SAKSHA runs on **Vercel** (the app) and **Supabase** (database, login, file storage).

**1. Supabase**

- Run every migration in `supabase/migrations/` in order.
- **Authentication → URL Configuration:** set *Site URL* to your production address and add `https://your-domain/auth/callback` under *Redirect URLs*. Without this, password-reset links will not work.
- **Authentication → SMTP:** add a custom SMTP provider (Resend works). Supabase's built-in mailer allows only a few emails an hour, which is not enough for real use.
- **Authentication → Providers → Email:** keep *Confirm email* on and turn *Allow new users to sign up* **off**. Accounts are created by the firm, never by strangers.

**2. Vercel**

Import the GitHub repository, then add these environment variables (the full list with explanations is in `.env.example`):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page. Server-only: never prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | Your production address, no trailing slash |
| `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` | Use an OpenAI-compatible provider such as Groq. `ollama` runs on your own machine and does not work on Vercel |
| `CRON_SECRET` | Any long random string; Vercel then sends it to the daily job automatically |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional. Without them nothing is emailed; everything else works |

Do **not** set `DEMO_PASSWORD` on the server, and never run `npm run seed` against the production database.

**3. Create the first firm** (from your own computer, with `.env.local` pointing at production):

```bash
npm run create-firm -- "Your Firm Name" "CA Full Name" ca@yourfirm.in
```

It prints a temporary password once. The CA signs in, chooses a password, and adds staff and clients from inside the app.

**4. Daily reminders and email.** `vercel.json` runs `/api/cron/notify` every morning (08:00 India time). It creates "due soon" and "overdue" reminders, then emails each person one digest. To run it by hand:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-domain/api/cron/notify
```

**5. Monitoring.** Point a free uptime monitor (UptimeRobot, Better Stack) at `/api/health`. It returns 200 when the app can reach the database and 503 when it cannot.

### Backups

- **Database:** Supabase's free plan keeps no downloadable backups. Before real client data goes in, move to the Pro plan (daily backups, plus optional point-in-time recovery) or schedule your own `pg_dump` from the connection string under Project Settings → Database.
- **Uploaded documents** live in the private `documents` storage bucket and are **not** included in a database dump. Copy the bucket on a schedule (Supabase Storage is S3-compatible, so `rclone` or the AWS CLI work).
- **Test a restore** once, on a throwaway project, before you need one.

## Known limitations

These are deliberate boundaries, not oversights:

- **No payments or invoicing.** Out of scope for this product.
- **No tax, GST or filing logic.** This is a permanent product boundary: SAKSHA manages the work around the CA, not the professional judgement.
- **Search uses database filters**, not full-text or semantic search. Clients and tasks are searched by name, title, PAN, GSTIN and email.
- **Email is a daily digest**, not instant. This keeps volume low and stays inside free-tier limits; run `/api/cron/notify` more often if you want faster delivery.
- **No content security policy header yet.** The other security headers are set in `next.config.ts`. A correct CSP for Next.js needs per-request nonces and its own testing.
- **Clients' temporary passwords are shared by the CA directly** (for example by phone) rather than emailed, on purpose.

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
