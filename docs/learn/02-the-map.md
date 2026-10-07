# Chapter 2 — The map: every folder, every file

This chapter is a tour. Skim it now, come back to it whenever you are lost.

The whole project is about **11,000 lines** of TypeScript and SQL. That is small.
You can genuinely read all of it.

---

## 2.1 The top level

```
ca-office-os/
├── app/            ← every page and URL in the application
├── components/     ← reusable pieces of interface
├── lib/            ← logic with no interface: database clients, rules, helpers
├── supabase/       ← the database itself, as SQL files
├── scripts/        ← command-line tools (seed data, AI evaluation)
├── docs/           ← this guide
├── package.json    ← dependencies and commands
├── tsconfig.json   ← TypeScript settings
├── next.config.ts  ← Next.js settings
├── middleware.ts   ← code that runs before every request
├── .env.local      ← SECRETS. Never committed. Not in git.
└── .env.example    ← the same file with the values removed, safe to commit
```

Four ideas explain that layout:

- **`app/` is the URL map.** Folder names become parts of the address.
- **`lib/` is everything that is not a screen.** If it would still make sense in a
  command-line program, it belongs in `lib/`.
- **`components/` is what is reused across screens.** Something used by one page
  only lives next to that page instead.
- **`supabase/` is the database's source code.** The database is not "whatever is
  in the cloud right now"; it is these files, applied in order.

---

## 2.2 `app/` — routing by folders

Next.js's App Router turns the folder structure into URLs.

| Thing | Meaning |
|---|---|
| `app/login/page.tsx` | the page at `/login` |
| `app/(app)/tasks/page.tsx` | the page at `/tasks` — parentheses are invisible |
| `app/(app)/tasks/[id]/page.tsx` | `/tasks/<anything>`, and `id` is that value |
| `layout.tsx` | wraps everything below it; stays mounted between pages |
| `loading.tsx` | shown automatically while the page below is fetching |
| `route.ts` | not a page — code that returns a raw response (a file, a redirect) |
| `not-found.tsx` | shown for an unknown URL |
| `actions.ts` | *not* a Next.js convention — this project's name for a file of Server Actions |

**`(app)` is a route group.** The parentheses mean "group these for organisation,
but do not put the word in the URL". Everything inside it shares one layout —
the sidebar, the top bar, and one authentication check — while `/login`, `/`
and `/change-password` sit outside and get none of that.

### The full route table

Every route, its file, and who may open it. "Roles" is what the page's own
`requireUser(...)` call permits; the database filters the rows on top of that.

**Public (outside `(app)`)**

| URL | File | Who |
|---|---|---|
| `/` | `app/page.tsx` | anyone — the marketing landing page. Signed-in users are sent to `/dashboard`. |
| `/login` | `app/login/page.tsx` | anyone signed out |
| `/change-password` | `app/change-password/page.tsx` | signed in, still on a temporary password |
| `/auth/signout` | `app/auth/signout/route.ts` | anyone — signs out and redirects |

**The application (inside `(app)`)**

| URL | File | Roles |
|---|---|---|
| `/dashboard` | `dashboard/page.tsx` | all three — it branches to a different component per role |
| `/clients` | `clients/page.tsx` | ADMIN, STAFF |
| `/clients/new` | `clients/new/page.tsx` | ADMIN |
| `/clients/[id]` | `clients/[id]/page.tsx` | ADMIN, STAFF |
| `/clients/[id]/edit` | `clients/[id]/edit/page.tsx` | ADMIN |
| `/tasks` | `tasks/page.tsx` | ADMIN, STAFF |
| `/tasks/new` | `tasks/new/page.tsx` | ADMIN |
| `/tasks/[id]` | `tasks/[id]/page.tsx` | ADMIN, STAFF |
| `/work` | `work/page.tsx` | CLIENT — the read-only client view of their tasks |
| `/staff` | `staff/page.tsx` | ADMIN |
| `/activity` | `activity/page.tsx` | ADMIN, STAFF |
| `/notifications` | `notifications/page.tsx` | all |
| `/notifications/[id]` | `notifications/[id]/route.ts` | all — marks read, then redirects to the record |
| `/workflows` | `workflows/page.tsx` | ADMIN |
| `/workflows/new` | `workflows/new/page.tsx` | ADMIN |
| `/workflows/[id]` | `workflows/[id]/page.tsx` | ADMIN |
| `/workflows/[id]/edit` | `workflows/[id]/edit/page.tsx` | ADMIN |
| `/workflows/runs/[id]` | `workflows/runs/[id]/page.tsx` | ADMIN, STAFF |
| `/documents` | `documents/page.tsx` | all |
| `/documents/new` | `documents/new/page.tsx` | ADMIN, STAFF |
| `/documents/[id]` | `documents/[id]/page.tsx` | all |
| `/documents/download/[docId]` | `documents/download/[docId]/route.ts` | signed in; the database decides the rest |
| `/messages` | `messages/page.tsx` + `messages/layout.tsx` | all |
| `/messages/[clientId]` | `messages/[clientId]/page.tsx` | ADMIN, STAFF |
| `/profile` | `profile/page.tsx` | CLIENT |
| `/ai` | `ai/page.tsx` | ADMIN |
| anything else | `[module]/page.tsx` | calls `notFound()` |

`app/(app)/[module]/page.tsx` is a catch-all with a dynamic segment, so it is
matched only after every specific route has failed. Its entire body is
`notFound()`.

### Two layouts worth knowing

**`app/layout.tsx`** — the root. The only place `<html>` and `<body>` exist. It
loads the font (Manrope, via `next/font/google`, exposed as the CSS variables
`--font-sans` and `--font-serif`) and sets the page title.

**`app/(app)/layout.tsx`** — the gate for everything signed-in:

```tsx
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  const user = await requireUser();
  // ...fetch the firm name and the unread notification count...
  return (
    <div className="app">
      <Sidebar role={user.role} ... />
      <main><TopBar ... />{children}</main>
    </div>
  );
}
```

`dynamic = "force-dynamic"` tells Next never to cache these pages as static
files. It must be there: the output depends on who is logged in.

**`app/(app)/messages/layout.tsx`** is a *nested* layout — the conversation list
lives there rather than in the page, so it stays on screen and is not refetched
while you switch between chats.

---

## 2.3 `lib/` — the logic

| File | What it holds |
|---|---|
| `lib/env.ts` | reads the two public Supabase settings, throws a clear error if missing |
| `lib/supabase/server.ts` | the Supabase client used on the server, as the signed-in user |
| `lib/supabase/client.ts` | the Supabase client used in the browser (only for file uploads) |
| `lib/supabase/admin.ts` | the service-role client that bypasses all security. `server-only`. |
| `lib/supabase/middleware.ts` | refreshes the session cookie and does the signed-in/out redirects |
| `lib/auth.ts` | `getCurrentUser`, `requireUser`, `friendlyError`. `server-only`. |
| `lib/accounts.ts` | creates a Supabase Auth account + profile row for a new staff or client login |
| `lib/types.ts` | every TypeScript type in the app, hand-written to mirror the database |
| `lib/validation.ts` | every Zod form schema, plus the temporary-password generator |
| `lib/format.ts` | dates, times, financial years, "Yesterday", byte sizes |
| `lib/tasks.ts` | the task status labels and the allowed transitions (UI mirror of the SQL rule) |
| `lib/workflows.ts` | template/run helpers, progress counting |
| `lib/documents.ts` | the bucket name, size limit, allowed types, storage path builder |
| `lib/messages.ts` | who a message is from, and how to label them for each viewer |
| `lib/notifications.ts` | notification labels and the link each type points at |
| `lib/ai.ts` | the model client: Groq or Ollama, timeouts, fallback, telemetry |
| `lib/ai-context.ts` | builds the plain-text summary of the firm that the model is allowed to see |
| `lib/ai-search.ts` | natural-language search: filters, validation, the query |
| `lib/ai-chat.ts` | the chat brain: routing a message to one of four tools |

---

## 2.4 `components/` — the shared interface pieces

| File | What it is |
|---|---|
| `ui.tsx` | `PageHeader`, `Panel`, `EmptyState`, the status badges, `AccessDenied` |
| `forms.tsx` | `Field`, `FormAlert`, `SubmitButton`, `CredentialsNotice` |
| `ActionButton.tsx` | a one-button form wired to a Server Action, with optional confirm |
| `Sidebar.tsx` | the left navigation; holds the per-role link map |
| `TopBar.tsx` | search box, financial-year pill, notification bell, avatar |
| `TaskTable.tsx` | the task list table, reused on five pages |
| `Timeline.tsx` | the activity history list |
| `charts.tsx` | `Donut`, `BarRows`, `TrendArea`, `Gauge` — hand-drawn SVG |
| `Logo.tsx` | the SAKSHA mark and wordmark |
| `Orb.tsx` | the animated sphere on the assistant card |

---

## 2.5 `supabase/` — the database as code

```
supabase/
├── migrations/
│   ├── 20260916000001_foundation.sql       firms, users, clients, tasks, activity log
│   ├── 20260918000002_workflows.sql        templates, steps, runs
│   ├── 20260919000003_documents.sql        requests, versions, the storage bucket
│   ├── 20260920000004_messages.sql         the client conversation
│   ├── 20260921000005_notifications.sql    notifications + the triggers that create them
│   ├── 20260921000006_ai_chat.sql          AI conversations and messages
│   └── 20260923000007_document_delete.sql  deleting an uploaded version
├── tests/rls_checks.sql                    nine manual authorization tests
└── reset_demo.sql                          wipes the demo data
```

A **migration** is a file of SQL that moves the database from one state to the
next. They are numbered by date so they always run in the same order. You never
edit an old migration once it has been applied somewhere — you add a new one.
That is why `20260923000007` exists rather than editing `...0003_documents.sql`.

Applying them: paste each into the Supabase SQL Editor in order, or use the CLI
(`npx supabase link --project-ref <ref>` then `npx supabase db push`).

---

## 2.6 `scripts/`

**`scripts/seed.mjs`** — fills an empty database with realistic demo data: two
firms, five users, five clients, thirteen tasks covering every status, two
workflow templates, three document requests and a four-message conversation. It
uses the *service-role* key, so it writes to tables directly instead of going
through the RPC functions. It refuses to run twice (it checks whether the demo
firm already exists).

**`scripts/eval-ai.mjs`** — the AI regression test. Eighteen real messages, each
with the tool the assistant should choose. Prints a pass rate and exits non-zero
below the threshold. Chapter 8 covers it in detail.

`.mjs` means "a JavaScript module run directly by Node" — these are plain
JavaScript, not TypeScript, so they can run without a compile step.

---

## 2.7 Conventions used everywhere

Learn these five and the code stops looking foreign.

**1. The `@/` import alias.** `tsconfig.json` maps `@/*` to the project root, so
imports are absolute:

```ts
import { requireUser } from "@/lib/auth";   // not ../../../lib/auth
```

**2. `actions.ts` next to the pages that use it.** Every feature folder has one.
It starts with `"use server"` and exports only async functions.

**3. The `...Row` type suffix.** `Task` is the database row. `TaskRow` is that
row *plus the joined names* the list query fetches:

```ts
export interface TaskRow extends Task {
  client: { name: string } | null;
  service: { name: string } | null;
  assignee: { name: string } | null;
}
```

**4. `...Form.tsx` is always a Client Component.** `ClientForm`, `TaskForm`,
`TemplateForm`, `UploadForm`, `MessageForm`, `ReviewForm`, `ReassignForm`,
`GenerateForm`, `LoginForm`, `ChangePasswordForm`.

**5. `SELECT` constants.** The same join list is needed on several pages, so it
is written once:

```ts
export const TASK_SELECT =
  "*, client:clients(name), service:services(name), assignee:users!tasks_assigned_to_fkey(name)";
```

The `users!tasks_assigned_to_fkey` part names the exact foreign key, because
`tasks` points at `users` more than once (`assigned_to` and `created_by`) and
Supabase would not otherwise know which one you mean.

---

## 2.8 The dependency list, and what each is for

From `package.json`. Seven runtime dependencies. That is deliberately small.

| Package | For |
|---|---|
| `next` | the framework: routing, server rendering, Server Actions, the build |
| `react`, `react-dom` | the UI library and its DOM renderer |
| `@supabase/supabase-js` | the core Supabase SDK — queries, auth, storage |
| `@supabase/ssr` | the cookie-aware wrappers around it, for server rendering |
| `zod` | validating form input at runtime |
| `server-only` | the build-time guard that keeps server files out of the browser |

Development-only: `typescript` and the three `@types/*` packages.

What is **not** there is as informative: no Tailwind, no Material UI, no icon
pack, no date library, no state manager, no ORM, no test runner. Every one of
those was replaced by something small and hand-written, which is why the whole
app is readable in an afternoon.
