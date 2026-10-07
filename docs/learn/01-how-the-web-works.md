# Chapter 1 — How the web works, and why this stack

Before any SAKSHA code makes sense, you need a correct picture of what happens
when someone types an address into a browser. Most confusion about web frameworks
comes from a fuzzy picture here.

---

## 1.1 The request and the response

You open Chrome and type `saksha.example.com/dashboard`.

1. Chrome asks the internet's phone book (DNS) which machine `saksha.example.com` is.
2. Chrome opens a connection to that machine and sends a **request**:

```
GET /dashboard HTTP/1.1
Host: saksha.example.com
Cookie: sb-xxxx-auth-token=eyJhbGciOi...
```

3. The machine — the **server** — runs some program, decides what `/dashboard`
   should contain, and sends back a **response**:

```
HTTP/1.1 200 OK
Content-Type: text/html

<!DOCTYPE html><html>...
```

4. Chrome reads the HTML and draws the page.

That is the whole of the web. Everything else is detail on top.

Things to notice, because they matter later:

- **The request carried a cookie.** A cookie is a small piece of text the server
  asked the browser to remember and send back every time. That is how the server
  knows it is you and not a stranger. SAKSHA's login session is a cookie.
- **The server ran a program.** It did not read a file off a disk. It looked at
  who you are, queried a database, and *built* the page for you.
- **`GET` is a verb.** `GET` means "give me". `POST` means "here is some data,
  do something with it" — that is what a form submission uses.

### Status codes

The `200` above is a status code. The ones you will meet in this project:

| Code | Meaning | Where you will see it |
|---|---|---|
| 200 | OK | a normal page |
| 307 | Temporary redirect | signed out → sent to `/login` |
| 401 | Not authenticated | the document download route, when you have no session |
| 403 | Forbidden | the AI provider rejecting a bad API key |
| 404 | Not found | a model name that does not exist; an unknown URL |
| 429 | Too many requests | Groq's free-tier rate limit |
| 500 | Server broke | a bug |

`lib/ai.ts` maps 404, 401/403 and 429 to different human sentences, which is a
good habit: a status code is for the machine, a sentence is for the person.

---

## 1.2 The three languages of a page

**HTML** is the content and structure:

```html
<h1>Dashboard</h1>
<p>9 active tasks</p>
```

**CSS** is the appearance:

```css
h1 { font-size: 28px; color: #101312; }
```

**JavaScript** is the behaviour — what happens when you click, type or drag.

A page can exist with only HTML. It will be ugly and static, but it will work.
That is worth remembering: in SAKSHA, most pages are *mostly* HTML built on the
server, and JavaScript is added only where interaction genuinely needs it. That
is a deliberate choice, not a limitation.

---

## 1.3 Two ways to build a page, and why it matters

**Server-side rendering (the old way, and again the modern way).** The server
queries the database, builds the complete HTML, and sends it. The browser
receives a finished page. Fast first paint, works without JavaScript, and — the
big one for us — the database credentials and the query logic never leave the
server.

**Client-side rendering (the 2015–2020 way).** The server sends an almost-empty
HTML file plus a large JavaScript bundle. The browser runs the JavaScript, which
then calls an API to fetch data, and *then* draws the page. Slower first paint,
needs a separate API layer, and every piece of data you want must be exposed
through a public endpoint.

SAKSHA uses the first for almost everything. That decision cascades:

- No separate API to build and secure. Pages talk to the database directly,
  on the server.
- No "loading spinner then content" on first load.
- Secrets (the Supabase service key, the Groq API key) can sit in server code
  because that code is never shipped to the browser.

React gives us the second one out of the box. Next.js is what gives us the first
one *while still writing React*.

---

## 1.4 React, in the smallest useful amount

React lets you describe a piece of interface as a function that returns markup.

```tsx
function Badge({ label }: { label: string }) {
  return <span className="badge">{label}</span>;
}
```

That is a **component**. `<Badge label="Overdue" />` renders
`<span class="badge">Overdue</span>`. Components can contain other components,
so a page is a tree of them.

The markup-inside-JavaScript syntax is called **JSX**. It is not HTML, it is
JavaScript that *looks* like HTML; that is why the attribute is `className` and
not `class` (`class` is a reserved word in JavaScript).

Two React ideas you will meet constantly in this project:

**Props** — the inputs to a component, passed like HTML attributes. `label` above
is a prop. Data flows down: a parent gives a child its props.

**State** — a value a component remembers between renders, and which causes it to
redraw when it changes.

```tsx
const [draft, setDraft] = useState("");
```

`draft` is the current value, `setDraft` changes it. Calling `setDraft("hello")`
re-runs the component and redraws it. This is what makes a text box feel alive.

Anything starting with `use` is a **hook** — a function that plugs into React's
machinery. `useState`, `useEffect`, `useRef`, `useActionState`. Hooks only work
inside components, and only in components that run in the browser.

---

## 1.5 Next.js, and the Server/Client Component split

Next.js is React plus everything React deliberately leaves out: routing, the
server, the build, image and font handling.

Its central modern idea is that **a component can run on the server or in the
browser, and you choose**.

### Server Components (the default here)

A Server Component runs on the server, once, when the page is requested. It can
be `async` — it can wait for a database query — and its code is never sent to the
browser.

```tsx
export default async function ClientsPage() {
  const user = await requireUser(["ADMIN", "STAFF"]);
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").order("name");
  return <table>{/* ... */}</table>;
}
```

Read that again and notice what is happening: a database query, sitting directly
inside the thing that draws the table. No API endpoint in between. This is the
single biggest simplification in the whole codebase, and the reason a
feature-complete app fits in ~11,000 lines.

Server Components cannot use `useState`, cannot handle `onClick`, cannot use the
browser at all. They have already finished running by the time you see the page.

### Client Components

Put `"use client"` at the very top of a file and it becomes a Client Component:
it is compiled into JavaScript, sent to the browser, and runs there. Now
`useState` and `onClick` work.

```tsx
"use client";
import { useState } from "react";

export function ConversationList({ items }) {
  const [query, setQuery] = useState("");
  // ...
}
```

In SAKSHA the Client Components are exactly the ones that need interaction:
`Sidebar` (it highlights the current page), `LoginForm`, `UploadForm`
(drag-and-drop and a progress bar), `ConversationList` (the search box),
`DashAssistant` (the chat), `TemplateForm` (add/remove step rows),
`SubmitButton` (disables itself while submitting). Everything else is a Server
Component.

**The rule of thumb:** start every component as a Server Component. Convert to a
client one only when you need state, an event handler, or a browser API. Keep the
client ones small — a Client Component makes all of its imports part of the
browser bundle.

**The guard rail:** the npm package `server-only`. Files that must never reach
the browser (`lib/auth.ts`, `lib/accounts.ts`, `lib/supabase/admin.ts`,
`lib/ai.ts`, `lib/ai-chat.ts`) start with:

```ts
import "server-only";
```

If anyone ever imports one of those into a Client Component, the **build fails**.
That is how the Groq API key and the Supabase service key are kept out of the
browser by construction rather than by memory.

---

## 1.6 Why this stack, specifically

You could build SAKSHA a dozen ways. Here is the honest reasoning for these
choices, including their costs.

**Why Next.js instead of plain React + an Express API?**
Because it removes an entire layer. With a separate API you write every feature
twice: once as an endpoint, once as the code that calls it — plus the
authentication check on the endpoint, plus the TypeScript types on both sides.
Server Components and Server Actions collapse that into one function.
*Cost:* your code is more tightly coupled to one framework.

**Why Supabase instead of running Postgres yourself?**
Because Auth alone — password hashing, session tokens, refresh tokens, email
confirmation — is weeks of work and an excellent way to introduce a security
hole. Supabase also gives file storage with the same permission model as the
database, which is what makes the document module tractable.
*Cost:* a dependency on one vendor. Mitigated by the fact that the database is
ordinary Postgres and the schema is plain SQL files — you can take it elsewhere.

**Why Row Level Security instead of checking permissions in the app?**
Because app checks are only as good as the developer's memory. Forget one
`where firm_id = ...` on one page and you have leaked another firm's client list.
With RLS the rule is attached to the *table*, so every query from every page —
including one written next year by someone else — is filtered. See chapter 4.
*Cost:* the rules are written in SQL, and debugging "why is this empty?" is
harder at first.

**Why database functions for writes instead of just inserting rows?**
Because a business rule enforced in one place is a rule; enforced in five places
it is a suggestion. "A task cannot go from To do straight to Completed" lives in
one SQL function. Every caller gets it. So does the audit log entry, in the same
transaction — you cannot change data without leaving a trace, because they are
the same transaction.
*Cost:* you write SQL, and SQL is harder to unit test than TypeScript.

**Why hand-written CSS instead of Tailwind or a component library?**
Because the app had to match a specific visual identity, and because a UI library
would be a larger dependency than everything else combined. The cost is real:
`app/globals.css` is ~90 KB and you have to keep it organised yourself.

**Why no chart library?**
The four charts needed are simple. Drawing them as SVG by hand is about 200 lines
total and adds nothing to the bundle. See chapter 9.

---

## 1.7 The build and run commands

```
npm install      # download the dependencies listed in package.json
npm run dev      # start the development server at http://localhost:3000
npm run build    # compile a production build (also type-checks and lints)
npm run start    # serve that production build
npm run typecheck# check types only, emit nothing — fast
npm run seed     # fill a fresh database with demo data
npm run eval:ai  # run the AI routing test set
```

**npm** is Node's package manager. **Node.js** is the program that runs
JavaScript outside a browser — it is what "the server" actually is here. The
project requires Node 20.6 or newer, because `npm run seed` uses Node's built-in
`--env-file` flag to load `.env.local` without an extra library.

`npm run dev` watches your files and reloads the page when you save. It is slower
than the production build on purpose — it compiles pages on demand.

---

## 1.8 Check your understanding

Before moving on, you should be able to answer these without looking:

1. What is the difference between a request and a response?
2. Why can a Server Component contain a database query, but a Client Component cannot?
3. What does `"use client"` do, and what is the cost of adding it?
4. What does `import "server-only"` protect against?
5. Why is server-side rendering a security advantage, not just a speed one?

If any of those are shaky, re-read the section rather than pressing on. Every
later chapter assumes this one.
