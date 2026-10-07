# Chapter 4 — Security: how the database says no

This is the most important chapter in the guide. If you understand it, the rest
of the codebase is straightforward. If you skip it, you will not understand why
the pages look so simple.

---

## 4.1 The problem

SAKSHA holds several firms' data in one database. Firm A must never see firm B.
Inside a firm, a staff member must see only their assigned clients, and a client
must see only themselves.

The obvious approach is to check in the application:

```ts
// The naive way. Do not do this.
const { data } = await supabase
  .from("clients")
  .select("*")
  .eq("firm_id", currentUser.firm_id);   // ← the check
```

This works, exactly as long as every developer remembers it on every query
forever. Forget it once, on one page, and you have leaked another firm's client
list. It is also invisible: nothing tells you the check is missing, because the
page looks fine on your test data.

---

## 4.2 The answer: Row Level Security

Postgres lets you attach the rule to the **table** instead. Once RLS is enabled,
every query against that table — from any page, any script, any developer,
forever — is silently filtered.

```sql
alter table public.clients enable row level security;

create policy clients_select on public.clients for select to authenticated
  using (public.app_can_view_client(id));
```

Now this:

```ts
const { data } = await supabase.from("clients").select("*");
```

...returns only the clients you are allowed to see. The `where` clause is not in
your code because it does not need to be. If you write a new page tomorrow and
forget everything you learned today, it is still safe.

Two pieces of a policy:

- **`USING`** — a filter on rows that already exist. "Which rows may you see?"
- **`WITH CHECK`** — a test on a row being written. "May you create this row?"

A read policy only needs `USING`. In SAKSHA, all seventeen table policies are
`FOR SELECT ... USING (...)`. Only the two storage policies use `WITH CHECK`.

---

## 4.3 The rule that matters: "reads are declarative, writes are procedural"

Here is the architectural decision, stated in the header of migration 1:

> - Every business table has RLS enabled.
> - Authenticated users only get SELECT policies.
> - All writes go through SECURITY DEFINER functions, which check permissions,
>   validate business rules and write the activity log in the same transaction.

Read the second line again. **There is not a single INSERT, UPDATE or DELETE
policy on any table in this database.** Not one.

And the grants are removed too:

```sql
revoke insert, update, delete on all tables in schema public from anon, authenticated;
```

So a signed-in user cannot write to a table even in principle. Try it and you get
`permission denied for table tasks` — which is test 5 in `rls_checks.sql`.

If you cannot write to a table, how does anything ever change? Through named
functions. That is the next section.

---

## 4.4 The identity helpers, and the NULL trick

Six small SQL functions answer "who is asking?". Every policy is built from them.

```sql
create function public.app_user_firm() returns uuid
language sql stable security definer set search_path = public as $$
  select firm_id from users
  where id = auth.uid() and is_active and not must_change_password
$$;
```

`auth.uid()` is Supabase's function for "the id of the signed-in user, taken from
their session token". So this returns your firm's id.

Now look at the `where` clause: `and is_active and not must_change_password`.

If your account is deactivated, or you are still on the temporary password you
were given, **this returns NULL**. And in SQL, `firm_id = NULL` is not false — it
is NULL, which is not true, so the row is excluded. Every policy that begins
`firm_id = app_user_firm()` therefore returns **zero rows** for such a user.

One `where` clause, in one function, locks out both deactivated accounts and
accounts on a temporary password, across every table, forever. That is the most
elegant idea in the schema, and `rls_checks.sql` test 4 proves it: a
temp-password account sees `0` clients.

### Why `SECURITY DEFINER`

By default a function runs with the caller's permissions. `SECURITY DEFINER`
means it runs with the permissions of whoever *created* it.

`app_user_firm()` **must** be a definer function, and the reason is a nice puzzle:
it reads `public.users`. The `users` table has RLS. The `users` policy calls
`app_user_firm()`. If the function ran as the caller, it would be filtered by the
policy, which would call the function, which would be filtered... infinite
recursion. Running as the owner steps outside RLS and breaks the loop.

Every `SECURITY DEFINER` function here also has `set search_path = public`. That
is mandatory hygiene: without it, a caller could create their own table called
`users` in a schema earlier in their search path and the function would read
*that* instead.

### The other five

```sql
app_user_role()              -- your role, or NULL. Same gating clause.
app_is_admin()               -- coalesce(app_user_role() = 'ADMIN', false)
app_client_id()              -- if you are a portal login, which client company
app_is_assigned(client_id)   -- are you on that client's staff roster?
app_can_view_client(id)      -- the big one, below
```

`app_is_admin()` wraps its result in `coalesce(..., false)` so it is never NULL.
That matters: `if not app_is_admin()` would not behave correctly on a NULL.

`app_client_id()` has an extra condition — the client company must be `ACTIVE`.
So deactivating a client blinds its logins immediately, independently of the
`users.is_active` flag. Two separate kill switches.

### One rule, one place

```sql
create function public.app_can_view_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients c
    where c.id = p_client_id
      and c.firm_id = public.app_user_firm()
      and (
        public.app_is_admin()
        or (public.app_user_role() = 'STAFF'  and public.app_is_assigned(c.id))
        or (public.app_user_role() = 'CLIENT' and c.id = public.app_client_id())
      )
  )
$$;
```

In English: *same firm, and (you are the CA, or you are staff assigned to this
client, or this client is you)*.

That function is called by **seven table policies, eight write functions and both
storage policies**. When the firm's access rule changes, you edit one function.
Not twenty files, not a code review hoping nobody missed a spot. One function.

This is worth internalising as a general lesson: find the sentence your whole
permission model reduces to, write it once, and make everything call it.

---

## 4.5 Every policy, in plain English

| Table | Who may read which rows |
|---|---|
| `firms` | exactly one: your own |
| `users` | always your own row; admins see everyone in the firm; staff see colleagues but **not** client logins; clients see only themselves |
| `clients` | `app_can_view_client(id)` |
| `client_users` | your own mapping; **only admins** see a client's list of logins |
| `client_staff` | internal only — clients never see who inside the firm handles their account |
| `services` | `true` — global reference data |
| `tasks` | same firm, and: admin → all; staff → tasks for assigned clients **or assigned directly to them**; client → their own |
| `activity_logs` | admin → whole firm; staff → their assigned clients plus their own actions; client → their own client, **and only whitelisted action types** |
| `workflow_templates` | same firm, internal only — clients never see how the firm organises work |
| `workflow_template_steps` | via an `EXISTS` onto the parent template (the table has no `firm_id`) |
| `workflow_runs` | same shape as tasks, without the "assigned to me" escape hatch. Clients **do** see runs |
| `document_requests`, `documents`, `messages` | same firm + `app_can_view_client(client_id)` |
| `notifications` | `user_id = auth.uid()` — the simplest policy in the schema |
| `ai_conversations` | `user_id = auth.uid() and firm_id = app_user_firm()` |
| `ai_messages` | `user_id = auth.uid()` |

Two of these deserve a closer look.

**The `tasks` staff branch is wider than `app_can_view_client`.** A staff member
also sees any task assigned *directly to them*, even if they are no longer on
that client's roster. That handles the real case where an assignment is removed
while work is still open — otherwise the task would vanish from the person
holding it.

**The client activity timeline is an allowlist.** Clients may read only these
actions: `CLIENT_CREATED`, `TASK_CREATED`, `TASK_STATUS_CHANGED`,
`DOCUMENT_REQUESTED`, `DOCUMENT_UPLOADED`, `DOCUMENT_DELETED`,
`DOCUMENT_ACCEPTED`, `DOCUMENT_REJECTED`, `DOCUMENT_REQUEST_CANCELLED`.

Everything else — `STAFF_ASSIGNED`, `CLIENT_UPDATED`, `TASK_ASSIGNED`,
`WORKFLOW_GENERATED`, `TEMPLATE_CREATED` — is invisible to clients, not because
anyone remembered to hide it, but because nobody added it. **New internal actions
are private by default.** That is the correct direction for a default to fail in,
and it is why the list has been extended three times across migrations rather
than being a "hidden actions" list.

---

## 4.6 Writes: the RPC pattern

Since no user can write to a table, every change goes through a named SQL
function. The app calls them like this:

```ts
const { data: id, error } = await supabase.rpc("create_task", {
  p_client_id: d.client_id,
  p_service_id: d.service_id,
  p_title: d.title,
  // ...
});
```

There are **26** of them. A typical one:

```sql
create function public.create_task(
  p_client_id uuid, p_service_id uuid, p_title text, p_financial_year text,
  p_period text, p_due_date timestamptz, p_priority public.task_priority,
  p_assigned_to uuid, p_requires_review boolean, p_description text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_client clients; v_id uuid; v_assignee text;
begin
  if not public.app_is_admin() then
    raise exception 'Only the CA can create tasks';
  end if;

  select * into v_client from clients where id = p_client_id and firm_id = public.app_user_firm();
  if not found then raise exception 'Client not found'; end if;
  if v_client.status <> 'ACTIVE' then raise exception 'This client is inactive'; end if;

  if p_assigned_to is not null then
    select u.name into v_assignee
    from client_staff cs join users u on u.id = cs.staff_id
    where cs.client_id = p_client_id and cs.staff_id = p_assigned_to and u.is_active;
    if v_assignee is null then
      raise exception 'That staff member is not assigned to this client';
    end if;
  end if;

  insert into tasks (...) values (...) returning id into v_id;

  perform public.app_log(p_client_id, 'task', v_id, 'TASK_CREATED', ...);
  return v_id;
end $$;
```

Every one has the same shape:

1. **Who** — a permission check that raises with a sentence a person can read.
2. **What** — look the row up *scoped to your firm*; "not found" for a wrong-firm
   id, never "forbidden", so the existence of other firms' data does not leak.
3. **Rules** — the business logic. Is the client active? Is that staff member on
   this account?
4. **Write** — the actual insert or update.
5. **Log** — `app_log(...)`, in the same transaction.

### The error messages are the user interface

Notice `raise exception 'Only the CA can create tasks'`. That string is shown to
the user, unchanged. The database owns the wording. `lib/auth.ts` has:

```ts
export function friendlyError(error, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "P0001" && error.message) return error.message;  // our own raise
  if (error.code === "23505") return "A record with these details already exists.";
  if (error.code === "23514") return "Some details are in the wrong format.";
  console.error(error);
  return fallback;
}
```

`P0001` is Postgres's code for "a function raised an exception". Those messages
were written for end users, so they pass through. Anything else is logged on the
server and replaced with a generic sentence — internal database detail never
reaches the browser.

Some functions go further and translate a constraint violation into English:

```sql
exception when unique_violation then
  raise exception 'A client with this email already exists';
```

### The task state machine — the best example in the schema

`change_task_status` is worth reading in full. It has three layers.

**Layer 1 — who.** Clients can never change status. A staff member can only
change a task assigned to them.

**Layer 2 — the state machine.** The transition is turned into a string and
checked against a literal list of the eleven legal moves:

```
TODO               → IN_PROGRESS, CANCELLED
IN_PROGRESS        → WAITING_FOR_CLIENT, UNDER_REVIEW, COMPLETED, CANCELLED
WAITING_FOR_CLIENT → IN_PROGRESS, CANCELLED
UNDER_REVIEW       → COMPLETED, IN_PROGRESS, CANCELLED
COMPLETED          → (terminal)
CANCELLED          → (terminal)
```

Anything else raises *"A task cannot move from To do to Completed"* — using
`task_status_label()` so the message says "To do", not `TODO`.

**Layer 3 — extra restrictions for staff.** Only the CA may cancel. Only the CA
may move a task out of `UNDER_REVIEW` (approve or return). And a staff member
cannot jump `IN_PROGRESS → COMPLETED` on a task that `requires_review` — they get
*"This task needs CA review. Submit it for review instead."*

Then the writes, including two conditional timestamps:

```sql
started_at = case when p_status = 'IN_PROGRESS' then coalesce(started_at, now()) else started_at end
```

`coalesce(started_at, now())` records only the *first* start. Coming back from
"waiting for client" does not reset it.

`lib/tasks.ts` contains the same transition table in TypeScript, used to decide
which buttons to draw. The database is the authority; the TypeScript copy is a
convenience so the UI does not offer a button that will fail. Keeping them in
sync is a real maintenance cost, and worth being honest about.

---

## 4.7 Grants: the second lock

Policies control reads. **Grants** control whether you may call a thing at all.

This is the single most surprising Postgres default for a beginner:

> When you create a function, Postgres grants EXECUTE on it to `PUBLIC` by
> default. Everyone. Including unauthenticated visitors.

Which is why migration 1 opens its privileges block with:

```sql
revoke execute on all functions in schema public from public, anon;
```

and then grants back, one signature at a time:

```sql
grant execute on function
  public.app_user_firm(), public.app_user_role(), public.app_is_admin(),
  public.create_client(text, text, text, text, text, text),
  public.create_task(uuid, uuid, text, text, text, timestamptz, public.task_priority, uuid, boolean, text),
  ...
to authenticated;
```

Note that every parameter type is spelled out. Postgres allows function
overloading, so a grant names one specific version.

**Four functions are revoked from `authenticated` too**, not just from anonymous
visitors:

- `app_log` — otherwise the app could forge audit entries attributing actions to
  other people.
- `app_save_template_steps` — otherwise anyone could rewrite any template's steps
  by id, skipping the admin check in its wrappers.
- `app_notify`, `app_firm_watchers`, `app_client_watchers` — otherwise a client
  could spam notifications to arbitrary users, or enumerate a firm's staff.

They still work, because a `SECURITY DEFINER` function calls them **as its
owner**, not as you. Understanding that sentence is what makes the revokes
obviously free rather than confusing.

Finally, at the end of every migration that creates tables:

```sql
revoke insert, update, delete on all tables in schema public from anon, authenticated;
```

It is repeated because `ALL TABLES` means "tables that exist right now" — each
migration must cover the tables it just created.

This is **defence in depth**. RLS alone already blocks those writes (no policy =
no rows). The missing grant blocks them again, at a different layer, and it fires
*first* — which is why the error in `rls_checks.sql` is `permission denied for
table tasks` rather than "0 rows affected". Two independent mechanisms must both
fail before a direct write succeeds.

One honest caveat: none of this sets `ALTER DEFAULT PRIVILEGES`, so a future
migration that creates a function and forgets its own revoke would reopen the
hole. The pattern relies on discipline. Saying so is more useful than pretending
it is airtight.

---

## 4.8 File storage under the same rules

One private bucket:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-documents', 'client-documents', false, 52428800, array[...10 types...])
```

`public = false` — no object has a public URL. 50 MB limit. Ten allowed types:
PDF, JPEG, PNG, WebP, CSV, plain text, and both old and new Word and Excel.
Notably absent: ZIP, executables, and SVG (an SVG can carry script).

The path convention is `<client_id>/<request_id>/<random>.<ext>`, built by the
server. The first segment carrying the client id is what makes this possible:

```sql
create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'client-documents'
         and public.app_can_view_client(public.app_storage_client(name)));

create policy documents_write on storage.objects for insert to authenticated
  with check (bucket_id = 'client-documents'
              and public.app_can_view_client(public.app_storage_client(name)));
```

`app_storage_client(name)` pulls the first folder out of the path and parses it
as a UUID — returning NULL on any failure, so a malformed path fails closed.

**The same function governs file access and table access.** A staff member
removed from a client loses the database rows and the files in the same instant.
One rule, two subsystems.

And note what is missing: **no UPDATE policy and no DELETE policy**. A user can
put a file in and read it back, and that is all. Files are never replaced in
place, and nobody can delete one straight from the bucket. Deleting goes through
`delete_document`, which authorises it, deletes the database row, and *returns
the storage path* so the server can remove the object using the service key.

That last bit is a nice piece of API design worth studying: the database cannot
reach object storage, so it does its half, hands back what it cannot do, and lets
the server finish. The trade-off it accepts is that a crash between the two steps
leaves an orphaned file — harmless and invisible — rather than a dangling row,
which would be a broken download link.

---

## 4.9 Testing it

`supabase/tests/rls_checks.sql` is a manual test script you paste into the
Supabase SQL editor after seeding. Its trick is a helper that impersonates a user
inside a transaction:

```sql
create or replace function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where email = p_email),
                      'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
```

Two mechanisms, both needed: `set_config('request.jwt.claims', ...)` fakes the
token that `auth.uid()` reads, and `set local role authenticated` switches the
actual Postgres role so grants and `TO authenticated` policies apply. It lives in
`pg_temp`, the session-local schema, so it vanishes when you disconnect and the
application can never call it.

Every block is `begin; ... rollback;` — nothing is written.

The nine tests:

1. Staff sees only assigned clients.
2. A client sees only their own client and tasks — proved with one neat query:
   `select distinct client_id = (my client) from tasks` must return a single `true`.
3. Cross-firm isolation: a user of Kapoor & Co. sees zero Sharma tasks.
4. A temporary-password account sees **0** clients. (The NULL trick.)
5. A direct `update tasks set status = 'COMPLETED'` is refused with
   `permission denied for table tasks`.
6. Staff cannot approve reviewed work.
7. An invalid status transition is refused, with the human labels in the message.
8. Staff cannot run admin operations.
9. `delete from activity_logs` fails **even as the superuser**.

Gaps worth adding later, if you want an exercise: nothing tests the storage
policies, the notification triggers, the document version/supersede logic, or
`delete_document`'s status repair.

---

## 4.10 The takeaways

1. **Reads are declarative, writes are procedural.** 17 select policies, zero
   write policies, 26 functions.
2. **One authorization function.** `app_can_view_client` is the whole rule.
3. **Fail closed via NULL.** A gated-out user's firm is NULL, and `x = NULL` is
   never true.
4. **Composite foreign keys for tenant isolation.** Structural, not procedural.
5. **Audit and action in one transaction.** `app_log` is called inside every
   write function, and revoked from the app so it cannot be called separately.
6. **Defence in depth.** RLS *and* revoked grants. A duplicate check in the
   function *and* a partial unique index. A length check in the function *and* a
   CHECK constraint.
7. **Error messages are product copy.** Written for the user, raised by the
   database, passed through unchanged.
