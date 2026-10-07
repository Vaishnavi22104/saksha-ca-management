# Chapter 5 — Logging in, and the life of one request

Chapter 4 showed the database deciding who sees what. This chapter shows how the
database knows who you are in the first place, and traces one page request from
keystroke to pixels.

---

## 5.1 How login actually works

### What a session is

HTTP has no memory. Every request is a stranger knocking. A **session** is how
the server recognises you across requests.

1. You submit your email and password.
2. The server checks them against the stored (hashed) password.
3. If correct, the server issues a **token** — a signed string that says "this is
   user `3f2a...`, valid until 14:35".
4. The token is stored in a **cookie**. The browser sends it with every
   subsequent request automatically.
5. The server reads the cookie, verifies the signature, and knows who you are.

Supabase Auth does all of steps 2–3. The token is a **JWT** (JSON Web Token) —
three base64 chunks: a header, a payload with your user id in a field called
`sub`, and a signature. Anyone can read a JWT; nobody can forge one without the
server's signing key.

`auth.uid()` inside a Postgres policy reads `sub` from that token. That is the
whole connection between "logged in" and "row level security".

**Access token and refresh token.** The access token is short-lived (an hour) so
a stolen one expires quickly. Alongside it is a long-lived refresh token used to
get a new access token without asking for the password again. Both live in the
cookie `sb-<project>-auth-token`, which `@supabase/ssr` splits into
`...auth-token.0`, `...auth-token.1` when it exceeds a browser's ~4 KB limit.

### The sign-in action

`app/login/actions.ts`:

```ts
const { error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  // Same message for unknown email and wrong password, so accounts can't be probed.
  return { error: "Those details don't match an account." };
}
```

That comment is a real security consideration. If "no such user" and "wrong
password" gave different messages, anyone could discover which email addresses
have accounts by typing them in one at a time.

After a successful sign-in the action reads the profile row and redirects:

```ts
redirect(profile.must_change_password ? "/change-password" : "/dashboard");
```

### The temporary password flow

There is no self-service password reset. The CA creates an account, the system
generates a temporary password, and the CA hands it over in person or by phone.

`lib/validation.ts`:

```ts
export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "Tmp-" + Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
```

Two decisions in five lines. It uses `crypto.getRandomValues` — a
cryptographically secure random generator — not `Math.random()`, which is
predictable. And the alphabet omits `I`, `O`, `l`, `0` and `1`, so a password
read out over the phone is unambiguous.

The new row has `must_change_password = true`, which (chapter 4) makes
`app_user_firm()` return NULL, so **the account can read nothing at all** until
the password is changed. The flag is cleared in
`app/change-password/actions.ts`, and it needs the service-role client to do it:

```ts
// must_change_password can't be edited by users directly (no RLS update policy),
// so the server clears it with the service role after the password really changed.
const admin = createAdminClient();
await admin.from("users").update({ must_change_password: false }).eq("id", user.id);
```

That is one of only two places the master key is used at runtime.

---

## 5.2 The three Supabase clients

This confuses everyone at first. There are three, and each exists for one reason.

| File | Built with | Key | Runs where | Obeys RLS? |
|---|---|---|---|---|
| `lib/supabase/server.ts` | `createServerClient` | anon | Server Components, Server Actions, Route Handlers | **yes**, as you |
| `lib/supabase/client.ts` | `createBrowserClient` | anon | the browser | **yes**, as you |
| `lib/supabase/admin.ts` | `createClient` | **service role** | server only | **no — bypasses everything** |

**The server client** is the one you use 95% of the time:

```ts
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: { getAll, setAll },
  });
}
```

It is `async` because Next 15's `cookies()` returns a promise. Never cache it
across requests — it is bound to one request's cookie jar.

Its `setAll` swallows failures:

```ts
setAll(cookiesToSet) {
  try {
    cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
  } catch {
    // Called from a Server Component, where cookies are read-only.
    // The middleware refreshes the session, so this is safe to ignore.
  }
}
```

Next forbids setting a cookie inside a Server Component (the response headers
have already started streaming) but allows it in a Server Action. The try/catch
lets one factory serve both.

**The browser client** is used in exactly one place in the whole app:
`app/(app)/documents/[id]/UploadForm.tsx`. It exists so a large file can go
straight from the browser to Supabase Storage without passing through a Server
Action, whose request body is capped at 2 MB. Chapter 7 covers that.

**The admin client** bypasses all security, so it is fenced off:

```ts
import "server-only";
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(env.supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

`import "server-only"` makes the build fail if this file ever reaches the browser
bundle. `persistSession: false` because it has no user session — it is a machine
identity. And the key is read straight from `process.env` rather than through
`lib/env.ts`, so it is never part of an object that client-importable code
touches.

It is used for exactly three things, all of which RLS cannot express:

1. Creating a Supabase Auth account for a new staff member or client
   (`lib/accounts.ts`).
2. Clearing `must_change_password`.
3. Deleting a file from the storage bucket after `delete_document` has authorised
   it.

Plus `scripts/seed.mjs`, which is a development tool.

---

## 5.3 Middleware: the code that runs before everything

`middleware.ts` at the project root:

```ts
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
```

The `matcher` is a regular expression with a negative lookahead: run on
**everything except** static build assets and images. So it runs on `/`,
`/login`, `/dashboard`, route handlers and form submissions alike.

`lib/supabase/middleware.ts` does two jobs.

### Job 1 — refresh the session

```ts
const { data: { user } } = await supabase.auth.getUser();
```

That single line is the refresh. There is a comment above it:

```ts
// getUser() validates the token with Supabase; do not replace with getSession().
```

The difference matters. `getSession()` decodes the cookie locally and trusts it.
`getUser()` calls the Supabase Auth server, which verifies the signature and, if
the access token has expired, mints a new pair from the refresh token — which
triggers the cookie-writing callback.

That callback writes each cookie **twice**, on purpose:

```ts
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
  response = NextResponse.next({ request });
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
}
```

Into `request.cookies` so the page about to render *in this same request* sees
the fresh token; onto `response.cookies` as a `Set-Cookie` header so the browser
stores it for next time.

### Job 2 — the signed-in / signed-out redirects

```ts
const PUBLIC_PATHS = ["/login", "/auth"];

const path = request.nextUrl.pathname;
// "/" is the public landing page. It is matched exactly — never as a
// prefix — so no signed-in route becomes public by accident.
const isPublic = path === "/" || PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

if (!user && !isPublic) { /* redirect to /login */ }
if (user && path === "/login") { /* redirect to /dashboard */ }
```

Two details worth staring at:

- `path === "/"`, **not** `path.startsWith("/")`. If it were a prefix test, every
  URL in the application would be public. This is the highest-consequence line in
  the file, and the comment exists for a reason.
- `path.startsWith(p + "/")` with the trailing slash. Without it, `/loginhack`
  would be treated as public.

Note `/change-password` is *not* public — you must be signed in to reach it,
which is correct: you have a session, you just have a temporary password.

### Where `must_change_password` is handled — and where it is not

Not in the middleware. That flag lives in the `public.users` table, and querying
it on every single request (including every image) would cost a database round
trip each time. Instead it is enforced in four places:

1. **`requireUser()`** — covers every page and action under `(app)`.
2. **The sign-in action** — redirects straight there.
3. **`/change-password` itself** — the inverse guard, so someone who has already
   changed it cannot sit on the form.
4. **The two route handlers** (notification open, document download), which
   cannot use `requireUser` because they must return a response rather than
   redirect into a page.

---

## 5.4 `requireUser` — the page-level gate

`lib/auth.ts`:

```ts
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, firm_id, name, email, role, is_active, must_change_password")
    .eq("id", user.id)
    .maybeSingle();
  return (data as AppUser | null) ?? null;
});
```

`cache()` is React's per-request memoiser. The layout calls `getCurrentUser`, the
page calls it, an action calls it — and only one auth call and one profile query
actually happen. The cache does not survive into the next request.

`.maybeSingle()` rather than `.single()`: it returns `null` instead of throwing
when there are zero rows — which is what an RLS-hidden row looks like.

```ts
export async function requireUser(roles?: Role[]): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_active) redirect("/auth/signout?reason=inactive");
  if (user.must_change_password) redirect("/change-password");
  if (roles && !roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}
```

Things to know:

- **`redirect()` throws.** It raises a special `NEXT_REDIRECT` exception that
  Next intercepts. So never wrap `requireUser` in a bare `try/catch` — you would
  swallow the redirect. It also means TypeScript narrows correctly afterwards,
  because `redirect()` is typed as returning `never`.
- **The order matters.** Inactive is checked before the password flag, so a
  deactivated user is signed out rather than parked on a form they cannot escape.
- **Roles are a flat allow-list.** `requireUser(["STAFF"])` does *not* admit an
  admin. Every call site spells out its full list. No hierarchy, no surprises.
- **This is defence in depth, not the primary control.** RLS is. `requireUser`
  decides what the interface shows and produces a clean redirect; the database
  decides which rows exist. Both, always.

And note the layout's `requireUser()` does **not** authorize the page. Layouts
and pages render in parallel in the App Router, and a layout does not re-run on
every nested navigation — so each page repeats its own check with its own role
list.

---

## 5.5 Creating accounts

`lib/accounts.ts` exports one function, `provisionAccount`, called from exactly
two places: creating a client with a portal login, and adding a staff member.
Both are behind `requireUser(["ADMIN"])`.

The sequence:

1. Generate a temporary password.
2. `admin.auth.admin.createUser({ email, password, email_confirm: true, ... })`.
   `email_confirm: true` marks the address confirmed so no verification email is
   needed — the firm hands the password over directly.
3. Insert the `public.users` profile row with `firm_id` taken from **the acting
   admin's firm** (this is the multi-tenancy anchor) and `must_change_password: true`.
4. If this is a client login, insert the `client_users` link.
5. Write an activity log row.
6. Return the plaintext password **once**, so the UI can show it.

Steps 3–5 each have a rollback: if the profile insert fails, the auth user is
deleted; if the `client_users` insert fails, both are deleted. An account that
exists in Auth but has no profile row would be a user who can sign in and see
nothing, forever, with no way to fix it from the interface.

The function's own comment states the contract plainly:

> Callers MUST have checked that `actor` is an active admin first.

It does no authorization of its own. That is a legitimate design — a helper that
takes an already-verified actor — but only because the contract is written down
and there are exactly two call sites.

The password is shown to the admin exactly once, by `CredentialsNotice` in
`components/forms.tsx`. It is never stored in plaintext anywhere.

---

## 5.6 One request, end to end

You are signed in as the CA. You click "Clients" in the sidebar.

**1. Navigation.** The sidebar's `<Link>` is a Next client-side navigation, not a
full page load. Next requests just the new segment.

**2. Middleware.** `middleware.ts` matches `/clients`. `updateSession` builds a
Supabase client over the request cookies and calls `getUser()`, which validates
the token (and silently refreshes it if it expired). You have a session and
`/clients` is not public, so no redirect. It returns the pass-through response.

**3. `loading.tsx` appears.** `app/(app)/loading.tsx` is an automatic Suspense
boundary. Next swaps in its skeleton immediately while the page's data is
fetched, so the interface never freezes.

**4. The layout.** `app/(app)/layout.tsx` is already mounted from the previous
page, so it does not re-run. (On a fresh page load it would: `requireUser()`,
then the firm name and unread count in parallel.)

**5. The page.** `app/(app)/clients/page.tsx` runs on the server:

```ts
const user = await requireUser(["ADMIN", "STAFF"]);
const supabase = await createClient();
const { data } = await supabase.from("clients").select("*").order("name");
```

`requireUser` calls `getCurrentUser`, which is memoised, so it costs one auth
check and one profile query. Then the clients query goes to Supabase carrying
your session token. **Postgres applies `clients_select`**, which calls
`app_can_view_client(id)`, which resolves your firm and role and filters the
rows. You get your firm's clients. A staff member running the same line gets only
their assigned ones. No `where` clause in the TypeScript.

**6. Render.** The component returns JSX. React turns it into HTML on the server.

**7. Response.** Next streams the HTML down, replacing the skeleton.

**8. Hydration.** The few Client Components on the page (here just the sidebar)
receive their JavaScript and become interactive.

Total: two round trips to Supabase (auth, then the query), zero API endpoints
written by you, and a security check you did not have to remember.

---

## 5.7 Check your understanding

1. Why does the middleware call `getUser()` rather than `getSession()`?
2. Why are the refreshed cookies written onto both the request and the response?
3. What exactly stops a user with a temporary password from reading data?
4. Why can't you wrap `requireUser()` in a `try/catch`?
5. Why does `lib/supabase/admin.ts` read the service key from `process.env` directly
   instead of from `lib/env.ts`?
6. A staff member and an admin load `/clients` with identical code. Why do they
   see different rows?
