# SAKSHA, explained from zero

You are holding the full explanation of how this application works — written for
someone who has never built a website before, and who wants to be able to rebuild
this one from an empty folder.

Nothing here assumes you know what a server, a database, a cookie or a framework
is. Every term is defined the first time it appears. Every design decision is
explained, not just described, because "what the code does" is easy to read off
the screen and "why it does it that way" is the part that actually teaches you.

---

## The chapters

Read them in order the first time. After that, jump around.

| # | File | What it teaches |
|---|---|---|
| 00 | `00-START-HERE.md` | This page. The mental model and the vocabulary. |
| 01 | `01-how-the-web-works.md` | Browsers, servers, HTTP, HTML/CSS/JS, React, Next.js. Why this stack. |
| 02 | `02-the-map.md` | Every folder and every file in the project, and what it is for. |
| 03 | `03-the-database.md` | What Postgres is. Every table, column, key and index in SAKSHA. |
| 04 | `04-security.md` | Row Level Security, database functions, and why writes never touch tables. |
| 05 | `05-auth-and-requests.md` | Logging in, cookies, sessions, and the life of one page request. |
| 06 | `06-pages-and-forms.md` | Routing, Server Components, Server Actions, validation, the form pattern. |
| 07 | `07-the-features.md` | Clients, tasks, workflows, documents, messages, notifications, dashboards. |
| 08 | `08-the-ai-assistant.md` | **The long one.** Groq, LLMs, prompts, routing, tools, safety, evaluation. |
| 09 | `09-styling.md` | The CSS system, the charts, why there is no Tailwind and no chart library. |
| 10 | `10-build-from-scratch.md` | The order to build it in, from empty folder to working app. |

---

## What the application actually is

A chartered accountancy firm — say, Sharma & Associates — does the same work
over and over for many businesses. Every month there is GST to file for each
client. Every quarter there is TDS. Every year there are income tax returns and
audits. Each of those jobs needs documents from the client, work by a junior
staff member, and a sign-off by the qualified CA.

Most small firms run this on WhatsApp, email and a spreadsheet. Things get lost.
Nobody can answer "what is still pending for ABC Traders?" without asking three
people.

SAKSHA is one screen that holds all of it:

- **Clients** — the businesses the firm works for, with their PAN, GSTIN and contacts.
- **Tasks** — one unit of work, for one client, one service, one period, with an owner and a deadline.
- **Workflows** — write the GST cycle down once as a template, then generate it for a client and a month; every step becomes a dated task automatically.
- **Documents** — the firm asks the client for a file; the client uploads it in their own portal; the CA accepts or rejects it; every version is kept.
- **Messages** — a conversation per client, instead of WhatsApp.
- **Notifications** — the app tells you when something needs you.
- **Activity log** — an unchangeable record of every change anyone made.
- **AI assistant** — ask "what needs me first today?" in plain English and get an answer built from the firm's own records.

Three kinds of people log in:

- **ADMIN** — the chartered accountant who owns the practice. Sees and does everything for their firm.
- **STAFF** — an employee. Sees only the clients they are assigned to, works on their own tasks, cannot approve anything.
- **CLIENT** — the business the firm works for. Sees only themselves: their work, their document requests, their messages.

---

## The one-paragraph mental model

Every piece of information lives in a **Postgres database** hosted by **Supabase**.
The database itself decides who is allowed to see which rows — that rule is not
in the application code, it is in the database, so no bug in a page can leak
another firm's data. The application is a **Next.js** program that runs on a
server: when your browser asks for `/dashboard`, the server reads the database as
*you*, builds the finished HTML, and sends it down. When you submit a form, the
browser posts it back to a **Server Action** — a function that only ever runs on
the server — which validates the input and calls a **stored function** inside the
database to make the change. The AI assistant is a separate, optional layer: it
reads a plain-text summary of your own records and a list of allowed actions,
and its only job is to choose which action to run and to write the sentence at
the end. It never sees your files, never writes SQL, and if it is unavailable the
app keeps working.

If you remember one sentence from this whole guide, make it this:

> **Reads are declarative, writes are procedural.**
> Who can *see* what is decided by rules attached to tables (policies).
> Who can *change* what is decided by functions you have to call by name (RPCs).

---

## Vocabulary you need before chapter 01

Read this once. You do not need to memorise it; come back when a word trips you.

**Client and server.** Two computers in a conversation. The **client** is your
browser (Chrome). The **server** is the machine that holds the program and
answers requests. Confusingly, this app also has *clients* in the business sense
(ABC Traders). The code always means the business one unless it says "browser".

**HTTP** — the language browsers and servers speak. A **request** ("give me
/dashboard") gets a **response** (some HTML, or an error).

**HTML** — the text format that describes a page's content and structure.
**CSS** — the language that says what it looks like. **JavaScript** — the
programming language browsers can run.

**TypeScript** — JavaScript with types added. A *type* is a promise about what a
value is: `string`, `number`, `Task`. The computer checks those promises before
the program runs, so a whole class of mistakes is caught at your desk instead of
in front of a client. Files ending `.ts` and `.tsx` are TypeScript.

**Framework** — a pre-built skeleton so you do not write the boring 80% yourself.
**React** is the framework for building the user interface out of reusable pieces
called **components**. **Next.js** is the framework built on top of React that
adds routing, the server half, and the build system.

**Database** — a program whose entire job is to store data safely and answer
questions about it quickly. **Postgres** (PostgreSQL) is the one used here.
**SQL** is the language you talk to it in. A **table** is like one sheet of a
spreadsheet; a **row** is one record; a **column** is one field.

**Supabase** — a company that hosts a Postgres database for you and bolts on the
things every app needs: user accounts (**Auth**), file storage (**Storage**), and
a web API so your code can query the database over the internet. It is not a
different database; it *is* Postgres, with a service wrapped around it.

**RLS — Row Level Security** — a Postgres feature where you attach a rule to a
table saying which rows each user is allowed to see. The rule runs inside the
database on every query. This is the backbone of SAKSHA's security.

**RPC — Remote Procedure Call** — calling a function that lives somewhere else.
Here it means: a function written in SQL, stored inside the database, that the
app calls by name. `supabase.rpc("create_task", {...})`.

**API key** — a long secret string that proves your program is allowed to use a
service. Treated like a password.

**Environment variable** — a setting kept outside the code, in a file called
`.env.local` that is never shared, so secrets do not end up on GitHub.

**LLM — Large Language Model** — the kind of AI that predicts text. ChatGPT is
one. **Groq** is a company that runs open models very fast and lets you call them
over the internet. **Ollama** is a program that runs a model on your own laptop.

---

## How to read the code alongside this guide

Open the project in VS Code. Use `Ctrl+P` and type a filename to jump to it.
Every chapter names exact files and functions; open them as you read. Reading
prose about code without the code open is close to useless.

The single most useful habit while learning this codebase: when you see a
function you do not recognise, `Ctrl+Click` its name. VS Code jumps to where it
was written. Do that until you hit something you already understand, then read
your way back up.

---

## What this project deliberately does not do

Knowing the edges of a system is part of understanding it. SAKSHA does not:

- calculate any tax, or know any tax law — it manages the *work*, not the *maths*;
- send email, SMS or WhatsApp — notifications live inside the app;
- support self-service password reset — the CA hands over a temporary password;
- paginate long lists, or do full-text search;
- give financial or legal advice through the assistant, by explicit instruction.

Every one of those was a decision, not an oversight. A project that says what it
is not is a project someone else can trust.
