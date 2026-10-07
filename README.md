# CA Office OS

A privacy-first workflow management platform for small Chartered Accountant (CA) firms. It connects clients, recurring work, staff, deadlines, review and history in one place.

> CA Office OS manages the work **around** the CA. It does not calculate tax, file returns or give professional advice.

**Status:** MVP, foundation phase (as of 16 Sep 2026). Planned completion: 7 Oct 2026.

## Features

### Working now

| Area | What works |
|---|---|
| Authentication | Email/password sign-in, sign-out, session refresh, route protection |
| First sign-in | Accounts created by the firm must replace their temporary password before seeing any data |
| Roles | CA/Admin, Staff and Client, each with its own navigation and dashboard |
| Clients | List, search, filter, add, edit, deactivate, reactivate; optional portal login with a temporary password |
| Staff | Add, deactivate, reactivate; assign to and remove from clients |
| Tasks | Create, filter, reassign, status changes with enforced transition rules, derived overdue badge |
| Activity log | Every business action is recorded; entries cannot be edited or deleted |
| Dashboards | CA: attention summary, client work, team workload. Staff: personal task queues. Client: work status and pending items |

### Planned

| Module | Planned date |
|---|---|
| Workflow templates and workflow runs | 22–23 Sep |
| Document requests, private uploads, review and versioning | 24 Sep |
| Client portal messaging | 25 Sep |
| Notifications | 28 Sep |
| Local AI assistant (Ollama), limited to workflow metadata | 30 Sep – 2 Oct |

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
