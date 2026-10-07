# Chapter 10 — Building it again, from an empty folder

This chapter is the order to build it in. Each stage leaves you with something
that runs, which is the only way to build anything large without getting lost.

Estimated honest effort for someone who has read chapters 1–9 and has done some
programming before: **five to seven weeks part-time**. Stages 0–4 are the
scaffolding and go quickly; stage 5 (workflows) and stage 6 (documents) are where
the real work is.

---

## Stage 0 — Tools (half a day)

Install **Node.js 20.6 or newer** (`node --version` to check), **Git**, and
**VS Code**. Create a free **Supabase** account.

```
npx create-next-app@latest ca-office-os
```

Answer: TypeScript **yes**, ESLint **yes**, Tailwind **no**, `src/` directory
**no**, App Router **yes**, import alias `@/*` **yes**.

```
cd ca-office-os
npm run dev
```

You should see a page at `localhost:3000`. Delete the placeholder content in
`app/page.tsx` and `app/globals.css` and replace them with something trivial.

Set up git immediately, and check that `.gitignore` contains `.env*.local`
**before** your first commit. A secret committed once is a secret forever, even
if you delete it in the next commit.

---

## Stage 1 — The database skeleton (2–3 days)

Create a Supabase project. Copy the URL, the `anon` key and the `service_role`
key into `.env.local`, and make a copy called `.env.example` with the values
blanked out, which you *do* commit.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DEMO_PASSWORD=
```

Now write the first migration by hand. Start small — `firms`, `users`, `clients`
— and in this order:

1. `create extension if not exists pgcrypto;` (for `gen_random_uuid()`)
2. The enums.
3. The tables, with their checks and foreign keys.
4. The indexes.
5. The identity helper functions (`app_user_firm`, `app_user_role`,
   `app_is_admin`, `app_client_id`, `app_is_assigned`, `app_can_view_client`).
6. `alter table ... enable row level security;` and the select policies.
7. `app_log`, then `create_client`.
8. The grant/revoke block.

Paste it into the Supabase SQL Editor and run it.

**Then immediately test the security**, before writing any application code. In
the SQL Editor, create the `pg_temp.act_as` helper from
`supabase/tests/rls_checks.sql`, insert two firms and two users by hand, and
check that impersonating one sees only their own rows.

Getting this right at three tables is a morning. Getting it wrong and discovering
it at seventeen tables is a fortnight.

---

## Stage 2 — Signing in (2–3 days)

1. `npm install @supabase/supabase-js @supabase/ssr server-only zod`
2. Write `lib/env.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`.
3. Write `middleware.ts` and `lib/supabase/middleware.ts` — the session refresh
   and the two redirects.
4. Write `lib/auth.ts` — `getCurrentUser`, `requireUser`, `friendlyError`.
5. Build `/login` with a Server Action.
6. Build `app/(app)/layout.tsx` with `requireUser()` and a hardcoded sidebar.
7. Build `/dashboard` showing nothing but "Hello, {name}".

Create one user by hand in the Supabase dashboard, insert the matching
`public.users` row in the SQL editor, and sign in.

**Checkpoint:** you can sign in, you are redirected to `/dashboard`, and visiting
`/dashboard` signed out sends you to `/login`.

This stage feels slow because there is no visible feature at the end. It is the
foundation everything else stands on, and rushing it is the most common way to
end up rewriting.

---

## Stage 3 — One complete feature: clients (3–4 days)

Do one feature completely, end to end, before starting a second. This is where
the pattern becomes muscle memory.

1. **SQL:** `create_client`, `update_client`, `set_client_active`, with their
   admin checks and `app_log` calls. Grant them.
2. **Types:** add `Client` and `ClientStatus` to `lib/types.ts`.
3. **Validation:** `clientSchema` in `lib/validation.ts`, with the PAN and GSTIN
   regexes.
4. **Actions:** `app/(app)/clients/actions.ts`.
5. **Components:** `Field`, `FormAlert`, `SubmitButton` in `components/forms.tsx`;
   `PageHeader`, `Panel`, `EmptyState` in `components/ui.tsx`.
6. **Pages:** `/clients`, `/clients/new`, `/clients/[id]`, `/clients/[id]/edit`.

**Checkpoint:** you can add a client, see them in the list, open them, edit them,
and deactivate them — and the error messages are readable when you submit an
invalid PAN or a duplicate email.

Now add a second user in a second firm and confirm you cannot see the first
firm's clients. If you can, stop and fix the policy before continuing.

---

## Stage 4 — Tasks and the state machine (4–5 days)

1. **SQL:** `tasks`, then `create_task`, `reassign_task` and `change_task_status`
   with its three layers of rules.
2. **`lib/tasks.ts`:** `TASK_STATUS` labels, the `TRANSITIONS` map,
   `ACTION_LABEL`, `allowedNext`, `isOpen`, `isOverdue`.
3. **Pages:** `/tasks` with filters, `/tasks/new`, `/tasks/[id]` with one button
   per allowed transition.
4. **`components/TaskTable.tsx`**, since you will reuse it on five pages.
5. **Staff management:** `client_staff`, `assign_staff`, `unassign_staff` with
   the open-task guard, and `lib/accounts.ts` + `/staff`.

**Checkpoint:** as a staff member, you can move your own task from To do to In
progress to Under review, and you **cannot** complete it directly, and you cannot
touch a task assigned to someone else. Sign in as the CA and approve it.

That is the first moment the app feels like a real product.

---

## Stage 5 — Workflows (4–6 days)

The hardest stage conceptually, because three entities are involved.

1. **SQL:** `workflow_templates`, `workflow_template_steps`, `workflow_runs`;
   the partial unique index on the cycle; `app_save_template_steps`;
   `create_workflow_template`, `update_workflow_template`,
   `set_workflow_template_active`, `generate_workflow`, `close_workflow_run`,
   `cancel_workflow_run`.
2. **`stepsFromFormData`** in `lib/validation.ts` — rebuilding an array from
   repeated form fields.
3. **`TemplateForm`** with add / remove / reorder rows.
4. **`GenerateForm`** with the duplicate-override checkbox.
5. **The run detail page** with its progress bar.

**Checkpoint:** define a 7-step GST template, generate it for a client for
September, and watch seven correctly dated tasks appear. Then edit the template
and confirm the generated tasks did **not** change.

That last check is the whole point of copying rather than referencing. If they
did change, re-read chapter 3.

---

## Stage 6 — Documents (4–6 days)

1. **SQL:** `document_requests`, `documents`, the storage bucket, the two storage
   policies, `create_document_request`, `record_document_upload`,
   `review_document`, `cancel_document_request`, and later `delete_document`.
2. **`lib/documents.ts`:** bucket name, size limit, allowed types,
   `resolveMimeType`, `storagePath`, `formatBytes`.
3. **`lib/supabase/client.ts`** — the browser client.
4. **`UploadForm`** with the three-step signed-ticket upload.
5. **The download route** with signed URLs and the `?mode=view` flag.
6. **`ReviewForm`** — accept, or reject with a mandatory reason.

**Do not skip straight to the signed-ticket upload.** Build the naive version
that posts the file to a Server Action first, and watch a 5 MB PDF fail. Then
you will understand what the complexity is buying, and you will never wonder
whether it was necessary.

**Checkpoint:** as a client, upload a 10 MB PDF with a working progress bar; as
the CA, reject it with a reason; as the client, see the reason and upload version
2; as the CA, accept it. Then try to delete the accepted version and get refused.

---

## Stage 7 — Messages and notifications (3–4 days)

1. **SQL:** `messages`, `send_message`, and the immutability trigger.
2. **The messaging interface** — list, thread, composer, with the layout holding
   the list.
3. **SQL:** `notifications`, `app_notify`, `app_firm_watchers`,
   `app_client_watchers`, and the three notification triggers.
4. **The bell** in the top bar, `/notifications`, and the mark-read route.

**Checkpoint:** assign a task to a staff member and watch a notification appear
for them without any application code creating it. That is the moment the
"logic in the database" argument stops being theoretical.

---

## Stage 8 — Dashboards and polish (3–5 days)

1. The three dashboards.
2. `components/charts.tsx`.
3. `app/(app)/loading.tsx` — the skeletons.
4. `scripts/seed.mjs`.
5. `supabase/tests/rls_checks.sql`.
6. The landing page.

Write the seed script earlier than you think you need it. Being able to reset to
a known, realistic state in one command changes how fast you can work.

---

## Stage 9 — The AI assistant (4–6 days)

Follow the ten steps in chapter 8, section 12. Briefly:

1. `askModel` against one provider.
2. Failure handling — timeout, 404, 401, 429, offline.
3. `collectFirmFacts` — and read the output yourself.
4. One tool: a summary.
5. The keyword router.
6. Model routing with a Zod schema, falling back to step 5.
7. Validated filters and the search.
8. Stored conversations with metadata.
9. Telemetry and `PROMPT_VERSION`.
10. The eval set.

**Checkpoint:** turn off your internet, ask "show me overdue GST work", and get
the right list with a note that the model was unavailable.

---

## Stage 10 — Production readiness (2–3 days)

- `npm run build` must pass with no errors.
- `npm run typecheck` must pass.
- Run `rls_checks.sql` and screenshot the results.
- `npm run eval:ai` above threshold.
- Deploy to Vercel: import the repository, add every environment variable from
  `.env.local` to the Vercel project settings, deploy.
- Check `DEMO_ACCOUNTS.md` contains no real passwords.
- Search the repository for the service-role key and the AI key. They must appear
  nowhere but `.env.local`.

---

## Mistakes to avoid, in rough order of how much time they cost

1. **Building the interface before the security.** Every page you write against a
   permissive database has to be re-checked when you add RLS. Do the database
   first.
2. **Checking permissions only in the application.** You will forget one. Use RLS.
3. **Putting business rules in the page.** Put them in the database function, and
   mirror them in TypeScript only to decide which buttons to draw.
4. **Building three features to 80%.** Build one to 100%. The first complete
   feature teaches you the pattern; the next four are then fast.
5. **Storing derived values.** Overdue, open counts, progress — compute them.
   A stored `is_overdue` column is a bug waiting for midnight.
6. **Referencing where you should copy.** A generated task must keep the title it
   was generated with.
7. **Skipping the seed script.** Testing by hand-entering data is how an afternoon
   disappears.
8. **Trusting the browser's MIME type.** Windows reports `.csv` as Excel.
9. **Letting a model's output reach a query unvalidated.** Always check names
   against the real list.
10. **Shipping AI with no eval and no telemetry.** You will not know when it
    breaks, and it will break quietly.

---

## What to build next, if you keep going

The honest list of what this project does not yet have, roughly in order of value:

- **Pagination.** Every list loads everything. Fine at demo scale.
- **Full-text search.** The current search is `ILIKE` and in-memory filtering.
- **Email.** Notifications live inside the app only.
- **Self-service password reset.**
- **Automated tests.** `rls_checks.sql` is manual, and there is no test runner.
- **Generated database types.** `lib/types.ts` is hand-written and can drift;
  `supabase gen types typescript` would remove that class of bug.
- **An index on `tasks.status`,** and on the columns the dashboards filter by.
- **Rate limiting on the AI endpoint.**
- **A payment gateway** — listed in the project's own future scope.

Knowing that list, and being able to say why each one was deferred rather than
missed, is a large part of what makes a final-year project defensible.

---

## A closing thought on the shape of this system

Almost every decision in SAKSHA is one of two patterns. It is worth naming them,
because they transfer to anything else you build.

**Push the rule down to the lowest layer that can enforce it.** Tenant isolation
is a foreign key constraint, not a code review. Access control is a database
policy, not a page. Notifications are a trigger, not a function call you might
forget. The audit log is in the same transaction as the change, not a line you
add afterwards. Every one of those choices trades a little convenience for a
guarantee that survives the next developer, including future you.

**Make the good path likely and the bad path harmless.** The AI system prompt
makes good behaviour likely; validating its output against the real client list
makes bad behaviour harmless. You need both, and if you can only have one, take
the second.
