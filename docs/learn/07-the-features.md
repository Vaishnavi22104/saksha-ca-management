# Chapter 7 — The features, one by one

Now that you know the pattern, here is what each module actually does, the
business rule behind it, and where that rule is enforced.

---

## 7.1 Clients

**What it is for.** The register of businesses the firm works for. PAN, GSTIN,
contact details, which staff handle them, and optionally a portal login so the
client can see their own work.

**Routes.** `/clients` (list, ADMIN + STAFF), `/clients/new` (ADMIN),
`/clients/[id]` (detail), `/clients/[id]/edit` (ADMIN).

**Actions.** `createClientAction`, `updateClientAction`, `setClientActiveAction`,
`assignStaffAction`, `unassignStaffAction` — each validating with Zod then
calling the matching RPC.

**The rules, and where they live:**

- Only the CA may add or edit a client. *In SQL.*
- PAN must be `ABCDE1234F`; GSTIN must be 15 characters. *In Zod and in a CHECK
  constraint.* Both, because Zod gives a nice message and the constraint means no
  path into the database can bypass it.
- The same email cannot be used twice **within one firm**. *Unique constraint,
  caught and rethrown as "A client with this email already exists".*
- **Clients are never deleted, only deactivated.** Deactivating cascades: the
  client's portal logins are set inactive too, in the same function.
- Creating a client can optionally create a login. The temporary password is
  shown once and never stored.

`update_client` does something worth copying. It stores the entire previous row
in the audit log:

```sql
perform public.app_log(..., 'CLIENT_UPDATED', ...,
  jsonb_build_object('old', to_jsonb(v_old) - 'created_at' - 'updated_at'));
```

That is how "what changed, and what was it before?" becomes answerable later.

**Unassigning staff has a guard** most systems forget:

```sql
select count(*) into v_open from tasks
where client_id = p_client_id and assigned_to = p_staff_id
  and status not in ('COMPLETED','CANCELLED');
if v_open > 0 then
  raise exception '% has % open task(s) for this client. Reassign them first.', v_name, v_open;
end if;
```

You cannot orphan work by removing someone from an account.

---

## 7.2 Tasks

**What it is for.** One task = one thing to do, for one client, one service, one
period, in one financial year, with an owner, a priority and a deadline.

**Routes.** `/tasks` (ADMIN sees all, STAFF sees only their own — the page adds
`.eq("assigned_to", user.id)` for staff), `/tasks/new` (ADMIN), `/tasks/[id]`,
and `/work` — the client's read-only view, which renders the same `TaskTable`
with `showAssignee={false}` so a client never sees staff names.

**The status lifecycle** is the heart of the module:

```
TODO ──────────────► IN_PROGRESS ──────► UNDER_REVIEW ──► COMPLETED
  │                    │    ▲  │              │  │
  │                    │    │  └──────────────┘  │   (CA returns for changes)
  │                    ▼    │                    ▼
  │        WAITING_FOR_CLIENT                COMPLETED
  │
  └──────────────► CANCELLED   (from TODO, IN_PROGRESS, WAITING, UNDER_REVIEW — CA only)
```

Eleven legal moves, listed in chapter 4. `COMPLETED` and `CANCELLED` are
terminal. You cannot jump from `TODO` to `COMPLETED`.

Layered on top:

- Only the assigned staff member (or the CA) may move a task at all.
- Only the CA may cancel.
- Only the CA may move a task **out of** `UNDER_REVIEW` — that is the approval.
- A staff member cannot complete a task that `requires_review`; they must submit
  it for review. This encodes the actual professional structure of a CA firm: a
  junior prepares, the qualified CA signs off.

`lib/tasks.ts` holds `allowedNext(user, task)`, a TypeScript mirror used to decide
which buttons to draw:

```ts
if (!admin && !(role === "STAFF" && task.assigned_to === user.id)) return [];
return TRANSITIONS[task.status].filter((to) => {
  if (to === "CANCELLED") return admin;
  if (task.status === "UNDER_REVIEW") return admin;
  if (task.status === "IN_PROGRESS" && to === "COMPLETED")    return admin || !task.requires_review;
  if (task.status === "IN_PROGRESS" && to === "UNDER_REVIEW") return admin || task.requires_review;
  return true;
});
```

`ACTION_LABEL` turns each `"FROM>TO"` into the sentence a person would say:
"Start work", "Submit for review", "Approve and complete", "Return for changes".
The button says what you are doing, not what state you are setting.

**Overdue is derived, never stored:**

```ts
export const isOpen = (t) => t.status !== "COMPLETED" && t.status !== "CANCELLED";
export const isOverdue = (t, now) => isOpen(t) && new Date(t.due_date) < now;
```

No nightly job, no stale flag, no "overdue" column that drifts. It is computed at
read time and always correct. The trade-off is that you cannot index it, which is
why the overdue filter runs in memory.

---

## 7.3 Workflows

**What it is for.** The firm does the same cycle over and over. Write it down
once, then generate it per client per period.

Three concepts, and confusing them is the main obstacle:

- **Template** — the recipe. "GST Monthly", 7 steps.
- **Step** — one line of the recipe. "Collect bank statement", needs a document,
  due 1 day after the start.
- **Run** — one cooking of the recipe. "GST Monthly for ABC Traders, September
  2026". It has real tasks with real dates.

**Generating** is the interesting operation. In one transaction,
`generate_workflow`:

1. Checks the caller is the CA.
2. Checks the template exists, is not archived, and has at least one step.
3. Checks the client exists and is active.
4. Checks no live run already exists for this client + service + year + period —
   unless `allow_duplicate` is passed.
5. Checks the assignee is on that client's roster.
6. Inserts the `workflow_runs` row, **copying** the template's name into it.
7. Inserts **one task per step**, copying the title, `requires_review` and
   `needs_document`, and computing `due_date = start + due_offset_days`.
8. Inserts **one document request per task that needs a file**.
9. Writes the activity log line with both counts.

One call, up to thirty tasks, several document requests, and — through the
triggers — a notification to the assignee for each task and to the client for
each document request. All atomic. That is what the database-function approach
buys you.

**The duplicate guard is deliberately overridable.** When the function raises
*"A GST Monthly workflow already exists for ABC Traders (September 2026)"*,
`GenerateForm.tsx` notices:

```ts
const duplicate = !!state.error && state.error.includes("already exists");
```

and reveals a checkbox: *"Create another workflow for this period anyway. Use
this only when the firm really does the cycle twice."* Overriding is a second,
deliberate action rather than a silently permitted one. (String-matching an error
message is fragile — a cleaner design would return a code — but it is honest
about what it is doing.)

**Closing versus cancelling:**

- **Close** marks the cycle done. If tasks are still open it refuses, unless you
  pass `force`. And forcing does **not** complete them — it records that the CA
  closed the cycle with work outstanding. The force flag changes the *record*,
  not the data. That is what an honest audit trail looks like.
- **Cancel** cancels every unfinished task in the run, then cancels the run.
  Because the cycle-uniqueness index excludes cancelled runs, the period is then
  free to be generated again.

**Templates are archived, never deleted.** Archiving blocks new generation and
leaves existing runs untouched. And a template's service cannot be changed after
creation — `TemplateForm` disables the select on edit and posts the original
value in a hidden field.

`TemplateForm.tsx` has one detail worth copying. The step rows are plain repeated
form fields (`name="step_title"`, `name="step_offset"`, checkboxes whose *value*
is the row index) rather than a JSON blob, so the form still submits correctly
without JavaScript. The ↑ ↓ ✕ buttons only reorder state.
`stepsFromFormData()` in `lib/validation.ts` reassembles the array with
`formData.getAll("step_title")` and a `Set` of the checked indices.

---

## 7.4 Documents

**What it is for.** The firm asks the client for a file; the client uploads it;
the CA accepts or rejects it. Every version is kept.

**The lifecycle:**

```
REQUESTED ──upload──► UPLOADED ──accept──► ACCEPTED   (terminal)
    ▲                    │
    │                    └──reject──► REJECTED ──upload v2──► UPLOADED …
    │
 (all versions deleted)                      CANCELLED (CA drops the ask)
```

The key design decision, from the migration header:

> A rejected request is never re-created. The client uploads version 2 against
> the SAME request.

So one request accumulates versions. `documents` has
`unique (request_id, version)`, and when a new version arrives, anything still
`UPLOADED` is marked `SUPERSEDED` — while `ACCEPTED` and `REJECTED` history is
left intact.

**Rejection requires a reason**, enforced in the database:

```sql
if not p_accept and length(trim(coalesce(p_reason, ''))) = 0 then
  raise exception 'Give the client a reason for the rejection';
end if;
```

You cannot bounce a document back with no explanation.

**Review happens once per version**, and only on the newest one:
*"A newer version has been uploaded. Review that one instead."*

### The upload, and the 2 MB problem

This is the most instructive piece of engineering in the app, because the
straightforward version is broken and the reason is not obvious.

The obvious approach posts the file to a Server Action. That fails: Next caps a
Server Action's request body, and `next.config.ts` sets it to 2 MB. Any real
scanned document is bigger, and the request is rejected before your code runs.

The working approach is three steps:

1. **The browser asks the server for permission.** `prepareUploadAction` checks
   the file's name, size and type, confirms the request is still open, builds the
   storage path, and asks Supabase Storage for a **signed upload ticket** — a
   short-lived permission to write one specific object. The file is not sent.
2. **The browser uploads straight to Storage**, using `XMLHttpRequest` because it
   is the only API that reports upload progress. The file never touches the
   Next.js server, so the body limit does not apply and the full 50 MB is usable.
3. **The browser tells the server it landed.** `recordUploadAction` re-checks
   that the path belongs to this request's client, then calls
   `record_document_upload`, which allocates the version number, supersedes the
   previous one and writes the log.

Step 3's path check matters:

```ts
if (!input.path.startsWith(`${found.request.client_id}/${input.requestId}/`)) {
  return { error: "That upload does not belong to this request." };
}
```

Without it, a returned ticket could be used to claim someone else's object.

**File types are decided by extension, not by the browser.** Windows reports
`.csv` as `application/vnd.ms-excel`, and files dragged from some applications
arrive with an empty type. So:

```ts
export function resolveMimeType(fileName: string, reported: string | undefined) {
  const byExtension = EXT_TYPES[extensionOf(fileName)];
  if (byExtension) return byExtension;
  return reported && ALLOWED_TYPES[reported] ? reported : "";
}
```

and the corrected type is what gets stored, so the bucket's own allowed-types
check passes too.

**Downloads never expose the bucket.** The route hands out a 300-second signed
URL. `?mode=view` omits the `download` instruction so the browser renders the
file inline; without it the browser saves it.

**Deleting** is deliberately narrow. An `ACCEPTED` document can never be
deleted — by anyone, including the CA — because it is part of the engagement
record. The CA may delete anything else; staff and clients may delete only their
own uploads. Then `delete_document` repairs the request's status: if nothing is
left it goes back to `REQUESTED`; if the version underneath was only
`SUPERSEDED` by the one just removed, it is promoted back to `UPLOADED` and
returns to the CA's review queue.

---

## 7.5 Messages

**What it is for.** One conversation per client, so a question about a GST return
is not buried in WhatsApp.

Deliberately not built: attachments, reactions, threads, read receipts, group
chats. Files go through document requests, where they get versions and a review.

**Structure.** `messages/layout.tsx` holds the conversation list, so it stays
mounted while you move between chats and only the thread refetches. The firm sees
one row per client with the last message and a lime dot when the client wrote
last. A client sees a single conversation with the firm.

**The firm speaks as one voice.** `lib/messages.ts`:

```ts
export function senderLabel(sender, viewerId, viewerRole) {
  if (sender?.id === viewerId) return "You";
  if (viewerRole === "CLIENT") return "Your CA firm";
  return sender?.role === "CLIENT" ? `${sender.name} (client)` : sender?.name ?? "Someone";
}
```

Internally you see which staff member wrote. The client sees "Your CA firm". That
is a product decision — the client hired the firm, not an individual — encoded in
one function.

**Messages are immutable.** A trigger blocks update and delete: a sent message is
a record of what was said.

`send_message` is one of only four functions a client may call, and it validates
that a linked task belongs to the same client, whoever is writing.

---

## 7.6 Notifications

**What it is for.** Telling someone that something needs them.

The whole point of this module is where the logic lives: **nothing in the
application creates a notification.** Three database triggers do.

| Event | Who is told |
|---|---|
| a task is assigned or reassigned | the assignee |
| a task moves to `UNDER_REVIEW` | every active admin |
| a document is requested | the client's logins |
| a document is uploaded | every admin + the staff assigned to that client |
| a document is accepted or rejected | the client's logins |
| a message is sent | the other side, with a 120-character preview |

`app_notify` refuses to notify you about your own action, and refuses to notify an
inactive or temp-password account. `app_firm_watchers` uses `UNION` (not
`UNION ALL`) so an admin who is also assigned to the client gets one notification,
not two.

The payoff, quoted from the migration:

> Notifications are generated by database triggers, not by the app, so they
> cannot be forgotten when a new screen calls an existing RPC.

Two RPCs exist for reading them, and both are quietly idempotent:

```sql
update notifications set read = true where id = p_id and user_id = auth.uid();
```

No "not found" error. Marking an already-read or non-existent notification simply
affects zero rows. For an action a user might trigger twice by double-clicking,
that is the right behaviour.

---

## 7.7 Activity

The read side of the audit trail. Every write function has already written a row;
this page just lists them, newest first.

`components/Timeline.tsx` renders them, and the `viewerRole` prop exists because
a client sees a different vocabulary than the firm does. The database has already
filtered which *actions* a client may see at all (chapter 4).

---

## 7.8 Staff

Add a staff member (creating their login through `provisionAccount`), activate or
deactivate them, and see their workload.

Two rules in `set_staff_active` worth noting:

```sql
if p_user_id = auth.uid() then raise exception 'You cannot change your own status'; end if;
```

An admin cannot lock themselves out. And the lookup includes `and role = 'STAFF'`,
so this function can never touch another admin or a client login — the scope
restriction is in the `where` clause, not in a separate check that could be
forgotten.

---

## 7.9 The dashboards

`app/(app)/dashboard/page.tsx` is four lines: call `requireUser()`, then render
`AdminDashboard`, `StaffDashboard` or `ClientDashboard`. Each is a different
*question*, not a different arrangement of the same numbers.

**Admin — "where does the firm stand?"**
Active tasks, overdue, clients waiting on a reply, work to review, documents to
review, documents awaited, active workflows, client messages this week. Then a
task-mix donut, a document pipeline, a performance trend over eight weeks, and
the assistant card.

**Staff — "what do I do next?"**
My open tasks, due today, overdue, waiting on client. Then a "Next up" card
showing the single most urgent non-blocked task with a button to open it, a
seven-day due-date bar chart with today highlighted, and a gauge of the month's
completion.

**Client — "what do they need from me?"**
Documents needed, with your CA, work in progress, completed. Then "What we need
from you" with an upload button, a progress gauge and the latest message.

Every number is computed in the page from a query — there is no cached summary
table to go stale. The counts are simple array filters over the rows the database
already decided you may see:

```ts
const open = tasks.filter(isOpen);
const overdue = open.filter((t) => isOverdue(t, now));
```

Which means the admin, a staff member and a client each run the *same* filter and
get a correct answer for themselves, because the rows differ.

**`DashAssistant.tsx`** puts the AI chat on the dashboard itself. It calls the
same `sendChatAction` the full `/ai` page uses and writes to the same
conversation store, so anything asked there appears in the sidebar's assistant
page with its full history. Quick question here; history there.

---

## 7.10 The seed script

`npm run seed` fills an empty database with a realistic demo. It uses the
service-role key, so it writes to tables directly rather than through the RPCs.

It creates two firms — `Sharma & Associates` and `Kapoor & Co.` The second exists
for one reason: to prove tenant isolation. Every RLS test that matters is "can
Neha at Kapoor & Co. see anything belonging to Sharma & Associates?"

Then five users, five clients, two client logins (one of them **deliberately left
on a temporary password**, so the forced-change flow can be demonstrated),
thirteen tasks covering every status including several already overdue, seven
back-dated activity log entries so the timeline is not empty on first load, two
workflow templates, three document requests and a four-message conversation.

No workflow *runs* are seeded — generating one is step 1 of the demo, and it is
the most impressive thing to show.

It refuses to run twice: it checks whether the demo firm already exists and exits
cleanly, telling you to run `reset_demo.sql` first. An idempotence guard on a
destructive-ish script is a small habit worth keeping.
