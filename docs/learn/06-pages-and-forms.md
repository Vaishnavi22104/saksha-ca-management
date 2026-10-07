# Chapter 6 — Pages, forms and Server Actions

You now know how the database keeps secrets and how the app knows who you are.
This chapter is the pattern you will repeat for every feature: read data into a
page, get data back out of a form.

---

## 6.1 Reading: a page is a function that returns markup

Here is a complete page, `app/(app)/activity/page.tsx`, near enough in full:

```tsx
import { PageHeader, Panel } from "@/components/ui";
import { ACTIVITY_SELECT, Timeline } from "@/components/Timeline";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Activity } from "@/lib/types";

export default async function ActivityPage() {
  const user = await requireUser(["ADMIN", "STAFF"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("activity_logs")
    .select(ACTIVITY_SELECT)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader title="Activity" description="Everything that has happened, newest first." />
      <Panel>
        <Timeline entries={(data ?? []) as unknown as Activity[]} viewerRole={user.role} />
      </Panel>
    </>
  );
}
```

That is the shape of nearly every page in SAKSHA:

1. `requireUser([roles])` — who may open this at all.
2. `createClient()` — a Supabase client carrying your session.
3. One or more queries.
4. Return JSX.

Four things to note.

**`export default async function`.** A Server Component may be `async` and may
`await`. That is the whole trick that removes the API layer.

**No `where` clause for permissions.** `activity_logs` has a policy. An admin
gets the firm's history; a staff member gets their assigned clients' history plus
their own actions; the query text is identical.

**`(data ?? []) as unknown as Activity[]`.** Supabase's TypeScript types for
nested joins are loose, so the code asserts the shape it knows is correct. The
`?? []` handles a failed query returning `null`. This double-cast is a small
honesty tax: the types in `lib/types.ts` are hand-written and *not* generated
from the database, so they can drift. A larger project would generate them.

**Parallel queries.** When a page needs several things, they run at once:

```ts
const [{ data: taskData }, { data: activityData }] = await Promise.all([
  supabase.from("tasks").select(TASK_SELECT).eq("client_id", id),
  supabase.from("activity_logs").select(ACTIVITY_SELECT).eq("client_id", id),
]);
```

`Promise.all` starts both and waits for both. Written sequentially with two
`await`s it would take the sum of the two; here it takes the longer of them.

### Dynamic segments and search parameters

```tsx
export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const { status } = await searchParams;
```

In Next 15 both are **promises** and must be awaited. `params` comes from the
folder name (`[id]`), `searchParams` from the query string (`?status=OPEN`).

### Filtering: SQL where possible, memory where necessary

`app/(app)/tasks/page.tsx` shows both:

```ts
let query = supabase.from("tasks").select(TASK_SELECT).order("due_date");
if (user.role === "STAFF") query = query.eq("assigned_to", user.id);
if (f.client) query = query.eq("client_id", f.client);
if (f.status === "OPEN") query = query.not("status", "in", "(COMPLETED,CANCELLED)");
const { data } = await query;

// These two cannot be done in SQL here:
let tasks = (data ?? []) as TaskRow[];
if (q) tasks = tasks.filter((t) => `${t.title} ${t.client?.name ?? ""}`.toLowerCase().includes(q));
if (f.overdue) tasks = tasks.filter((t) => isOverdue(t, now));
```

The text search spans a joined column, and "overdue" is *derived* (`isOpen(t) &&
due_date < now`) rather than stored, so both happen in memory after the query.
That is fine at this scale and would need rethinking at ten thousand tasks —
knowing which of your shortcuts have a scale limit is part of understanding your
own system.

### `"OPEN"` as a pseudo-status

`OPEN` is not a value in the database enum. It means "not COMPLETED and not
CANCELLED". The app translates it. The same idea appears in the AI search filters
(chapter 8), where `OPEN` and `OVERDUE` are both derived and deliberately applied
*after* the query rather than pushed into it.

---

## 6.2 Writing: Server Actions

A **Server Action** is an async function in a file that begins `"use server"`. It
only ever runs on the server, but you can attach it to a form as if it were local.

```ts
"use server";

export async function createClientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["ADMIN"]);

  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: clientId, error } = await supabase.rpc("create_client", {
    p_name: d.name, p_email: d.email, p_phone: d.phone ?? "",
    p_pan: d.pan ?? "", p_gstin: d.gstin ?? "", p_business_type: d.business_type,
  });
  if (error || !clientId) return { error: friendlyError(error, "The client could not be created.") };

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { ok: true, clientId: clientId as string };
}
```

### What actually happens when you submit

Next replaces the function in the browser bundle with a **reference id**. Calling
it sends a `POST` to the current URL carrying that id and the form data. The
server looks up the function, runs it, and sends back the returned value plus any
re-rendered page content. The function body never reaches the browser — which is
why it can hold `requireUser`, database calls and secrets.

### The signature is fixed

```ts
(previousState: ActionState, formData: FormData) => Promise<ActionState>
```

The first parameter is named `_prev` everywhere in this codebase because nothing
uses it. It exists because React's `useActionState` passes the previous result in.

### `ActionState`

```ts
export interface ActionState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  credentials?: { email: string; password: string; name: string };
}
```

Every field optional, so `{}` is a valid starting state.

- `error` — something went wrong overall. Shown as a red banner.
- `fieldErrors` — per-input messages, keyed by the input's `name`. Shown under
  that input.
- `message` — a success or info line.
- `ok` — succeeded.
- `credentials` — the one-time temporary password, shown once after creating a login.

Actions that need more widen it inline:
`Promise<ActionState & { clientId?: string }>`.

### Wiring it to a form

```tsx
"use client";
import { useActionState } from "react";
import { createClientAction } from "./actions";
import { Field, FormAlert, SubmitButton } from "@/components/forms";

export function ClientForm() {
  const [state, action] = useActionState(createClientAction, {});

  return (
    <form action={action} noValidate>
      <FormAlert state={state} />
      <Field label="Business name" name="name" state={state}>
        <input id="f-name" name="name" required maxLength={200} />
      </Field>
      <SubmitButton>Add client</SubmitButton>
    </form>
  );
}
```

`useActionState(fn, initial)` returns `[state, wrappedAction]`. You give the
wrapped action to `<form action={...}>`. On submit React calls
`fn(previousState, formData)`, and whatever it **returns** becomes the new
`state` and re-renders the form.

So the error handling is just: return an object, read it back out. No try/catch
in the component, no error state to manage, no manual `fetch`.

Note `noValidate` on the form. Browser validation is switched off deliberately so
that Zod's messages, rendered by the server, are the single source of wording.

### The three form helpers

`components/forms.tsx`:

**`FormAlert`** — renders `state.error` as a red `role="alert"` box, or
`state.message` as a `role="status"` one.

**`Field`** — draws the label, the input, and either the hint or the error:

```tsx
const error = props.state?.fieldErrors?.[props.name];
return (
  <div className={`field${error ? " invalid" : ""}`}>
    <label htmlFor={`f-${props.name}`}>{props.label}</label>
    {props.children}
    {error ? <span className="err" role="alert">{error}</span>
           : props.hint ? <span className="hint">{props.hint}</span> : null}
  </div>
);
```

The `htmlFor={`f-${name}`}` is why every input is given `id="f-name"`,
`id="f-email"` and so on. That pairing is what makes clicking the label focus the
input, and what a screen reader uses to announce the field.

**`SubmitButton`**:

```tsx
const { pending } = useFormStatus();
return <button type="submit" disabled={pending} aria-disabled={pending}>
  {pending ? (props.pendingText ?? "Saving…") : props.children}</button>;
```

`useFormStatus()` is a React hook that reports whether the enclosing form is
mid-submission. It gives you double-submit protection and a "Saving…" label with
no state of your own. It has one rule: the component calling it must be a
**child** of the `<form>`, not the component that renders the form.

**`ActionButton`** packages the whole pattern for mutations that are not really
forms — "Cancel this workflow", "Archive template", "Delete version 2":

```tsx
<ActionButton
  action={cancelRequestAction}
  fields={{ request_id: id }}
  label="Cancel request"
  confirmText="Cancel this request? The client will no longer be asked for this file."
/>
```

It renders a one-button form with hidden inputs built from `fields`, and calls
`window.confirm` in `onSubmit`, cancelling the submit if you say no.

---

## 6.3 Validation with Zod

Never trust form data. A browser can be edited, and a request can be sent by
anything. **Zod** checks the shape at runtime and produces messages.

```ts
export const clientSchema = z.object({
  name: z.string().trim().min(1, "Enter the client's name.").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: optional(z.string().trim().regex(/^(\+91)?[6-9]\d{9}$/, "Use a 10-digit mobile number.")),
  pan: optional(z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN format is ABCDE1234F.")),
  gstin: optional(z.string().trim().toUpperCase().regex(/^\d{2}[A-Z0-9]{13}$/, "GSTIN has 15 characters.")),
  business_type: z.enum(BUSINESS_TYPES),
});
```

Schemas also **transform**: `.trim()`, `.toLowerCase()`, `.toUpperCase()` clean
the value before it is checked, so a PAN typed in lower case is upper-cased
first rather than rejected.

Three HTML quirks the schemas have to absorb:

**Empty strings.** An untouched text box submits `""`, not nothing. The local
helper turns it into `undefined` *before* validating, so a blank optional field
does not fail a regex:

```ts
const optional = (schema: z.ZodString) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());
```

**Checkboxes.** An unchecked checkbox is absent from the form data entirely; a
checked one sends the string `"on"`:

```ts
requires_review: z.preprocess((v) => v === "on", z.boolean()),
```

**Select "none".** An empty selection sends `""`, but the column wants NULL:

```ts
assigned_to: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
```

Always `safeParse`, never `parse`:

```ts
const parsed = clientSchema.safeParse(Object.fromEntries(formData));
if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
```

`parse` throws; `safeParse` returns `{ success, data | error }`, which fits the
return-an-object pattern.

`fieldErrors` turns Zod's issue list into the flat map the `Field` component
reads, keeping the **first** message per field:

```ts
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
```

One cross-field example worth knowing:

```ts
export const passwordSchema = z.object({
  password: z.string().min(8, "Use at least 8 characters."),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: "The two passwords don't match.",
  path: ["confirm"],
});
```

The explicit `path: ["confirm"]` is what makes the message land under the confirm
box instead of at form level.

### Validation happens twice, and that is correct

Zod checks the shape. The database function checks the *rules* — is this client
active, is that staff member on the roster, is this transition legal. Neither
replaces the other. Zod gives a fast, per-field message; the database is the
authority that a direct API call cannot bypass.

---

## 6.4 `revalidatePath`, and why you need it

Next caches rendered pages. A Server Action runs *after* the page was rendered,
so without help, a mutation can leave stale HTML in the browser's router cache.

```ts
revalidatePath("/clients");
revalidatePath("/dashboard");
```

That marks those paths stale, so the next visit refetches.

The rule used consistently across this codebase:

- **Creating or deleting** → revalidate the **list** page and any **aggregate**
  page (`/dashboard`).
- **Editing** → revalidate the **detail** page too.
- **A change with knock-on effects** → revalidate everything it touches.
  `generateWorkflowAction` revalidates `/workflows`, `/tasks` *and* `/dashboard`,
  because generating a run creates tasks.

An action ending in `redirect(...)` does not need it for the page it leaves.

---

## 6.5 The two ways an action ends

**Return a state** — the form re-renders with errors or a success panel. This is
how `ClientForm` shows the one-time password:

```tsx
if (state.ok && state.credentials) {
  return <div className="panel panel-b narrow">…<CredentialsNotice state={state} />…</div>;
}
```

**Redirect** — navigate away:

```ts
revalidatePath("/tasks");
redirect(`/tasks/${taskId}`);
```

Because `redirect()` throws, it must sit **outside** any `try` block, and code
after it is unreachable.

---

## 6.6 Passing extra arguments to an action

Sometimes an action needs a value that is not in the form — an id from the URL:

```ts
export async function updateClientAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> { /* ... */ }
```

The component binds the first argument, so React still supplies the last two:

```tsx
const [state, action] = useActionState(
  updateClientAction.bind(null, props.client.id),
  {},
);
```

`.bind(null, value)` produces a new function with the first parameter already
filled in.

---

## 6.7 Route Handlers: when you do not want a page

`route.ts` exports HTTP verbs and returns a raw `Response`. Two exist here.

**`app/(app)/documents/download/[docId]/route.ts`** — hands out a short-lived
signed URL for a private file:

```ts
const { data } = await supabase.storage
  .from(DOCUMENT_BUCKET)
  .createSignedUrl(document.storage_path, 300, inline ? undefined : { download: document.file_name });
return NextResponse.redirect(data.signedUrl);
```

A **signed URL** is a temporary link with a cryptographic signature in the query
string. Supabase Storage will serve the object to anyone holding it, for 300
seconds. The bucket stays private; you never expose a permanent link.

The `?mode=view` parameter decides whether the signed URL carries a `download`
instruction. With it, the browser renders the PDF or image; without it, the
browser saves the file. That one flag is the difference between "Open" and
"Download" in the interface.

**`app/(app)/notifications/[id]/route.ts`** — marks a notification read, then
redirects to whatever it was about. A `GET` that has a side effect, which is
mildly impure but exactly what a notification link should do.

Note both of these do their own auth check rather than calling `requireUser`,
because they need to return a `401` or a redirect rather than render a page:

```ts
if (!user || !user.is_active || user.must_change_password) {
  return NextResponse.json({ error: "Not signed in" }, { status: 401 });
}
```

A folder cannot contain both `page.tsx` and `route.ts` — one URL, one kind of
response.

---

## 6.8 The full round trip, one more time

Adding a client:

1. `/clients/new` renders (Server Component) and includes `<ClientForm />` (Client Component).
2. You type and press "Add client".
3. `SubmitButton` sees `pending` and disables itself.
4. React POSTs the form data to the Server Action reference.
5. `createClientAction` runs on the server: `requireUser(["ADMIN"])`, then Zod.
6. If Zod fails, it returns `{ fieldErrors }` — no database call happens. The
   messages appear under the offending inputs.
7. If Zod passes, it calls `supabase.rpc("create_client", {...})`.
8. Postgres runs the function: admin check, insert, activity log — one transaction.
9. If the function raises (`'A client with this email already exists'`),
   `friendlyError` passes the sentence through and it appears in the red banner.
10. On success, `revalidatePath` clears the cached list, and the action returns
    `{ ok: true, credentials }`.
11. The form re-renders as a success panel showing the temporary password once.

At no point did you write an API endpoint, a `fetch` call, a loading state, or a
permission check on a route.
