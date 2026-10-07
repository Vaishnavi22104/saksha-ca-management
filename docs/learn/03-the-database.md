# Chapter 3 — The database

Everything SAKSHA knows lives in a PostgreSQL database hosted by Supabase. This
chapter explains what that means, then walks every table.

---

## 3.1 What a relational database actually is

Think of a spreadsheet workbook, but strict.

- A **table** is one sheet. `clients` is a table.
- A **row** is one record. One row of `clients` is one business.
- A **column** is one field, and every value in it must be the same **type** —
  text, a number, a date, a true/false.
- A **primary key** is the column that uniquely identifies a row. Here it is
  almost always `id`, a **UUID**.
- A **foreign key** is a column that points at another table's primary key. It is
  a promise the database enforces: `tasks.client_id` must be a real client, and
  you cannot delete a client while tasks point at it.

A **UUID** is a 128-bit random identifier like
`3f2a1b4c-9d8e-4f7a-b6c5-1e2d3f4a5b6c`. SAKSHA uses them instead of 1, 2, 3
because sequential ids leak information (a competitor can tell how many clients
you have from the URL `/clients/47`) and because they can be generated anywhere
without asking the database first.

**SQL** is how you talk to it:

```sql
select name, email from clients where status = 'ACTIVE' order by name;
```

Most of the time you will not write SQL by hand in this app — the Supabase
library builds it:

```ts
supabase.from("clients").select("name, email").eq("status", "ACTIVE").order("name")
```

That produces exactly the query above.

### Transactions

A **transaction** is a group of changes that either all happen or none do. When
`generate_workflow` creates a workflow run, seven tasks, three document requests
and a log entry, all of that is one transaction. If the last insert fails, the
first six are undone. You never end up with half a workflow.

Every one of SAKSHA's database functions is automatically a transaction. That is
a large part of why the writes live there.

---

## 3.2 What Supabase adds

Supabase is not a different database. It is Postgres plus:

- **Auth** — a `auth.users` table and the whole password/session machinery.
- **Storage** — file buckets, with permissions expressed in the same way as table permissions.
- **PostgREST** — a web service that turns HTTP requests into SQL, so your app can query the database over the internet.
- **A dashboard** — a web UI to run SQL, browse tables and see your keys.

The critical consequence: because the database is reachable over the internet,
the *database itself* has to hold the security rules. That is chapter 4.

### The three keys

In your Supabase project settings you get:

| Key | Secrecy | Used by |
|---|---|---|
| Project URL | public | everything |
| `anon` public key | public — it is in the browser | normal queries, as the signed-in user |
| `service_role` key | **secret** | server-only admin work; bypasses all security |

The `anon` key is safe to ship to the browser *because* Row Level Security makes
it useless on its own — it identifies the project, not a person. The
`service_role` key is the opposite: it is a master key, and if it leaks, every
firm's data is exposed. In this project it appears in exactly three places, all
server-side: `lib/supabase/admin.ts`, `app/change-password/actions.ts` (via that
client), and `scripts/seed.mjs`.

---

## 3.3 The enums

An **enum** is a type whose value must be one of a fixed list. Using one instead
of plain text means a typo is a database error, not a silent bug.

```sql
create type public.user_role     as enum ('ADMIN', 'STAFF', 'CLIENT');
create type public.client_status as enum ('ACTIVE', 'INACTIVE');
create type public.task_status   as enum ('TODO', 'IN_PROGRESS', 'WAITING_FOR_CLIENT',
                                          'UNDER_REVIEW', 'COMPLETED', 'CANCELLED');
create type public.task_priority as enum ('LOW', 'MEDIUM', 'HIGH');
create type public.workflow_status as enum ('ACTIVE', 'COMPLETED', 'CANCELLED');
create type public.document_request_status as enum
  ('REQUESTED', 'UPLOADED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CANCELLED');
create type public.document_status as enum ('UPLOADED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');
create type public.notification_entity as enum
  ('client', 'task', 'document_request', 'workflow', 'message');
create type public.ai_role as enum ('USER', 'ASSISTANT');
```

Two honest notes:

- `document_request_status` declares `UNDER_REVIEW`, but no function ever writes
  it. The real path is `REQUESTED → UPLOADED → ACCEPTED | REJECTED`. It is a
  leftover from a planned feature.
- `notification_entity` is lowercase while every other enum is uppercase,
  because it mirrors the `entity_type` text values used in `activity_logs`.
  An inconsistency worth knowing about rather than hiding.

---

## 3.4 The tables

Seventeen tables. Here is each one, what it is for, and the interesting parts.

### `firms`
One row per accountancy practice. The root of everything.
`id`, `name`, `is_active`, timestamps. No `firm_id` — it *is* the firm.

### `users`
One row per login, for all three roles. Its `id` is deliberately the **same UUID**
as the Supabase Auth account, so Auth owns the password and this table owns the
business identity (name, role, which firm).

Key columns: `firm_id`, `name`, `email` (globally unique), `role`, `is_active`,
`must_change_password` (**defaults to `true`** — every new account starts on a
temporary password).

The foreign key to `auth.users` is `on delete restrict`: you cannot delete an
auth account while a profile row points at it. That is why `reset_demo.sql`
deletes profiles before auth users.

### `clients`
The businesses the firm works for.

`name`, `email`, `phone`, `pan`, `gstin`, `business_type`, `status`.

Two check constraints enforce Indian formats in the database itself:

```sql
check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$')
check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$')
```

Two unique constraints, and the second one is the most important line in the
whole schema:

```sql
constraint clients_firm_email_unique unique (firm_id, email),
constraint clients_id_firm_unique    unique (id, firm_id)  -- target for composite FKs
```

The first says: the same email can exist at two different firms, but not twice
at one firm. The second exists purely so that child tables can do this:

```sql
constraint tasks_client_same_firm
  foreign key (client_id, firm_id) references clients (id, firm_id)
```

Read that carefully. A task carries both `client_id` and `firm_id`, and the
foreign key checks the **pair**. It is therefore *structurally impossible* for a
task in firm A to point at a client in firm B. Not "unlikely if we remember the
check" — impossible. The database will refuse the row.

Five tables use this trick: `tasks` (twice), `workflow_runs`,
`document_requests` (twice), `documents` (twice), `messages`.

### `client_users`
Maps a portal login to the business it represents.
Primary key is `user_id` **alone**, which encodes the rule: one login belongs to
exactly one client company, though one company may have several logins.

### `client_staff`
Which staff members may work on which client. Primary key `(client_id, staff_id)`.
This small table is the entire STAFF permission model — everything a staff member
can see traces back to a row here.

### `services`
The catalogue: GST, Income Tax, TDS, Bookkeeping, Audit, Payroll, MCA/ROC
Compliance, Other. Seeded by the migration itself. **Global, not per firm** —
which is why its security rule is simply "everyone may read it".

### `tasks`
The unit of work.

`client_id`, `service_id`, `financial_year` (`^[0-9]{4}-[0-9]{2}$`, e.g. `2026-27`),
`period` (free text: "September 2026", "Q2"), `title`, `description`,
`assigned_to` (nullable — unassigned is legal), `status`, `priority`,
`requires_review` (**defaults `true`** — review is opt-out, matching how a real
firm works), `due_date`, `created_by`, and three timestamps: `created_at`,
`started_at` (set the first time it moves to In progress) and `completed_at`.

Migration 2 adds `workflow_step_no` and `needs_document` for generated tasks.

### `activity_logs`
The append-only audit trail. Every write function adds one row here in the same
transaction as the change.

`firm_id`, `user_id` (who), `client_id`, `entity_type`, `entity_id`, `action`
(e.g. `TASK_STATUS_CHANGED`), `description` (a human sentence), `metadata` (JSON).

Two triggers make it genuinely immutable:

```sql
create trigger activity_logs_immutable
  before update or delete on public.activity_logs
  for each row execute function public.prevent_activity_change();
```

That function does nothing but raise an error. **Even the database superuser is
blocked** — triggers apply to everyone. The only way past is to explicitly
disable the trigger, which is exactly what `reset_demo.sql` has to do, and the
fact that it has to say so out loud is the point.

`messages` has the same treatment: a sent message is a record of what was said.

### `workflow_templates` and `workflow_template_steps`
A template is a named checklist for one service — "GST Monthly". Its steps are
ordered rows: `position` (1–30), `title`, `requires_document`, `requires_review`,
`due_offset_days` (0–365).

`workflow_template_steps` is one of only two tables in the schema with
`on delete cascade`: steps have no meaning without their template.

### `workflow_runs`
One concrete execution: this client, this service, this financial year, this
period.

The interesting column is `template_name text not null` — a **copy** of the
template's name, not a reference. `template_id` is nullable. This is deliberate,
and it is the schema's central idea about history:

> Generating a run **copies** the step titles into tasks, so editing a template
> later never rewrites work that already exists.

Learn the distinction: **reference** when you want changes to propagate;
**copy** when the old value was a fact about a moment in time. A task titled
"File GSTR-3B" that was created last September should still say that after you
rename the step this September.

There is also a clever unique index:

```sql
create unique index workflow_runs_cycle_unique
  on public.workflow_runs (client_id, service_id, financial_year, lower(trim(period)))
  where status <> 'CANCELLED';
```

Three things at once. It enforces one live cycle per client + service + year +
period. `lower(trim(period))` means `"Q1"`, `"q1 "` and `" Q1"` all collide.
And the `where status <> 'CANCELLED'` makes it a **partial index** — cancelled
runs are ignored, so cancelling frees the slot and the cycle can be redone.

### `document_requests` and `documents`
A **request** is the firm asking for a file. A **document** is one uploaded
**version** answering it. Versions are never overwritten — `documents` has
`unique (request_id, version)`.

The pair `file_name` / `storage_path` matters. `file_name` is what the user sees
("September bills.pdf"). `storage_path` is where the bytes are, and it is built
by the server as `<client_id>/<request_id>/<random>.<ext>` — **never** from the
uploaded filename. That single decision removes path traversal, unicode tricks
and filename collisions as a class of problem.

### `messages`
`client_id`, `sender_id`, `message` (1–2000 characters, enforced by a check),
optional `task_id`. One implicit thread per client. Immutable by trigger.

The migration header names what was deliberately left out: attachments,
reactions, threads, read receipts, group chats. Files go through document
requests instead.

### `notifications`
One row per person per thing they should know about. `user_id` is the recipient.
`entity_type` + `entity_id` say what it is about, so the app can build the link.

Nothing in the application creates these. **Database triggers do** — see 3.6.

### `ai_conversations` and `ai_messages`
A saved chat with the assistant, belonging to one person. Its header comment:

> A conversation belongs to ONE person. Even another admin in the same firm
> cannot read it: what you asked the assistant is yours.

`ai_messages` carries `tool` (which tool produced this answer) and `meta` (a JSON
blob with the rows used, the model, the latency, the prompt version). That is
what makes an answer checkable weeks later.

---

## 3.5 `firm_id` — why it is on eleven tables

**It is on:** `users`, `clients`, `tasks`, `activity_logs`, `workflow_templates`,
`workflow_runs`, `document_requests`, `documents`, `messages`, `notifications`,
`ai_conversations`.

**It is not on:** `firms` (it is the firm), `services` (global), `client_users`,
`client_staff`, `workflow_template_steps`, `ai_messages` (all reachable through
one already-scoped parent).

It is technically redundant — you could always reach the firm through
`client_id`. It is there for three reasons:

1. **Speed and simplicity of the security rules.** Every policy can begin
   `firm_id = app_user_firm()` — one indexed comparison, no join.
2. **The composite foreign keys.** `firm_id` is the second column of
   `references clients (id, firm_id)`. Without it, cross-firm pointers would be
   merely unlikely rather than impossible.
3. **Reach.** A firm-level event (`USER_DEACTIVATED`) has no client, so
   `client_id` is null and `firm_id` is the only handle. `reset_demo.sql`
   deletes entirely by `firm_id`.

The usual cost of duplicating a column is that the copy drifts out of sync. The
composite foreign key is exactly what removes that risk.

---

## 3.6 Triggers: things that must never be forgotten

A **trigger** is code the database runs automatically when a row is inserted,
updated or deleted. Five exist here.

**Two enforce immutability** — `activity_logs_immutable` and `messages_immutable`,
described above.

**Three create notifications:**

| Trigger | Fires on | Does |
|---|---|---|
| `tasks_notify` | insert or update on `tasks` | notifies the assignee when a task is assigned or reassigned; notifies every admin when a task moves to `UNDER_REVIEW` |
| `document_requests_notify` | insert or update on `document_requests` | on insert: tells the client a document is needed. On status change: `UPLOADED` tells the firm, `ACCEPTED`/`REJECTED` tells the client |
| `messages_notify` | insert on `messages` | tells the other side, with a 120-character preview |

The migration header explains why this lives in the database:

> Notifications are generated by database triggers, not by the app, so they
> cannot be forgotten when a new screen calls an existing RPC.

That is the whole argument for putting logic in the database, in one sentence.
Add a new admin screen that calls `create_task` and notifications work with zero
new code. Write a bulk import that goes through `generate_workflow` — one call
can produce dozens of notification rows without a single line of application
code. The trigger sits *below* every possible caller.

Three helper functions support them: `app_notify` (which silently refuses to
notify you about your own action, or to notify an inactive user),
`app_firm_watchers` (every active admin **union** every staff member assigned to
this client — `UNION` not `UNION ALL`, so an admin who is also assigned gets one
notification, not two), and `app_client_watchers` (every active portal login for
that client).

---

## 3.7 Indexes

An **index** is a lookup structure. Without one, finding "all tasks for client X"
means reading every task. With one it is close to instant. The cost is disk space
and a small slowdown on writes.

Postgres creates an index automatically for every primary key and every unique
constraint. On top of those, this schema adds about twenty-five, each matching a
query the app actually runs. Three patterns are worth learning from:

**Match the sort as well as the filter.**
```sql
create index notifications_user_idx on public.notifications (user_id, read, created_at desc);
```
The bell icon runs `where user_id = ? and not read order by created_at desc`.
This index covers the filter *and* the sort, so the database reads the answer
straight off the index.

**Index the direction you actually query.** `client_users` has its primary key on
`user_id`, so "which client is this login?" is free; the extra index
`client_users_client_idx` on `(client_id)` makes the reverse question — "which
logins belong to this client?" — fast too.

**A partial index is a constraint you could not otherwise express.** The
`workflow_runs_cycle_unique` index above, and:

```sql
create unique index document_requests_task_title_unique
  on public.document_requests (task_id, lower(trim(title)))
  where task_id is not null and status <> 'CANCELLED';
```

"A task never collects the same document twice — unless the earlier request was
cancelled." No plain `UNIQUE` can say that.

A gap worth knowing: there is no index on `tasks.status`, so the dashboard's
`where status not in ('COMPLETED','CANCELLED')` scans. Fine at demo scale, and an
obvious first optimisation later.

---

## 3.8 Reading the schema yourself

The best exercise you can do with this chapter: open
`supabase/migrations/20260916000001_foundation.sql` and read it top to bottom.
It is 586 lines and it is commented. You will recognise almost everything.

Then answer these:

1. Why does `users.id` have no default, when every other `id` defaults to `gen_random_uuid()`?
2. What happens if you try to insert a task whose `client_id` belongs to another firm?
3. Why is `template_name` stored on `workflow_runs` when `template_id` is right there?
4. What would break if `workflow_runs_cycle_unique` were a plain unique constraint instead of a partial index?
5. Who can delete a row from `activity_logs`?
