# SAKSHA — demonstration script

A twelve-minute walkthrough. Every screen has real seeded data behind it, so
nothing has to be created live and nothing can go blank in front of an
audience.

---

## Before you start

1. All migrations run in Supabase, in filename order. The last one is
   `20260923000007_document_delete.sql`.
2. `npm run seed` has been run once and finished without errors.
3. `npm run dev` is running, and `localhost:3000` loads.
4. Open **two browser windows**: one normal, one private. You will be signed
   in as the CA in the first and as a client in the second, and switching
   windows is much faster than signing out and in.
5. Have `supabase/tests/rls_checks.sql` open in a Supabase SQL editor tab, in
   case anyone asks about security.

Every account uses the password in your `.env.local` as `DEMO_PASSWORD`.

| Who | Email | Why you would use it |
|---|---|---|
| CA (admin) | `anil@sharma-associates.test` | The main tour |
| Staff | `rahul@sharma-associates.test` | Has the firm's only overdue task |
| Staff | `priya@sharma-associates.test` | Busiest workload |
| Staff | `sneha@sharma-associates.test` | The audit engagement |
| Client | `rajesh@abctraders.test` | **Asks to change password on first sign-in** |
| Client | `meera@xyzpvt.test` | A normal client, already set up |
| Other firm | `neha@kapoor-co.test` | The tenant-isolation proof |

> Sign in as Rajesh **before** the demo if you do not want the
> change-password screen in the middle of it — or leave it, because it is a
> good thing to show.

---

## The walkthrough

### 1. The dashboard — 1 min · *sign in as the CA*

Land on `/dashboard`. Point at the numbers, not the design: open tasks,
overdue work, what is waiting on the CA specifically.

> "This is the view the CA owns the firm from. Two things need him
> personally right now — nobody else can approve them."

Type into the assistant panel on the right: **"What should I look at first
today?"** It answers on this page, without navigating away.

*(If the network is unreliable at your venue, skip the live question — the
saved conversations in step 7 show the same thing and cannot fail.)*

---

### 2. Clients — 30 sec

`/clients`. Six clients, one inactive. Open **ABC Traders**: PAN, GSTIN, the
assigned staff member, the open work and the documents, all on one page.

> "Everything about one client is on one screen. That is the single question
> a CA's office asks all day."

---

### 3. Workflows — 3 min · **the centrepiece**

This is the part to slow down on.

`/workflows`. The template library: six templates as cards, each showing its
steps as coloured dots.

> "Violet means the client has to send us a file. Lime means the CA has to
> sign it off. That colour rule is the same on every screen in the app."

**Open GST Monthly.** The cycle is drawn top to bottom: seven steps, each
with the day it falls due and what it needs.

**Now generate one.** In the panel on the right, pick **Vertex Solutions
LLP**, click the **September 2026** chip, and change the start date. Point at
the schedule below it redrawing:

> "Before I commit to anything, it shows me the exact seven tasks and the
> exact dates. Then one click creates all of them."

Press **Generate**. Seven dated tasks appear, all at once.

> "Doing that by hand is seven forms. Twenty clients a month is a hundred and
> forty. This is the reason the software exists."

**Open a running workflow** — ABC Traders, September 2026. The progress dial,
which steps are done, which is stuck under review.

**Then show the builder**: `/workflows/new`. Click **TDS quarterly** and the
whole outline fills in. Rename a step, drag the day count, switch on **File
from client**, and watch the preview on the right follow along.

> "A firm writes its own way of working into the system once. It is a
> template, not hard-coded logic."

---

### 4. Documents — 2 min

`/documents`. The requests, each showing its state.

- **September sales invoices** (ABC Traders) — accepted. Open it: the PDF
  previews in the page, and clicking it opens the real invoice register.
- **Cancelled cheque for the refund account** — the good one. **Version 1 was
  rejected** because the scan is unreadable; open it and it visibly is.
  Version 2 is the clear one.

> "Every version is kept. When someone asks in March which copy we filed
> from, the answer is on the screen, with who approved it and when."

- **September bank statement** (Om Services) — still requested, nothing
  uploaded. That is what the firm is chasing.

Now switch to the **client window** and sign in as `rajesh@abctraders.test`.

> "This is the same system from the client's side. He sees his own files and
> nothing else — no other client, no internal notes."

Upload anything from `scripts/demo-files/` to show the progress bar.

---

### 5. Tasks and the rules — 1.5 min

Sign in as **Rahul** in the client window (or a third one).

Open a task that is **In progress** and show the buttons: he can send it for
review, he cannot mark it Completed.

> "A junior cannot approve their own work. That is not a hidden button — the
> database refuses the change. I will show you that in a moment."

Switch back to the CA window and approve it.

---

### 6. Messages — 1 min

`/messages`. The conversation list, WhatsApp style. Open **ABC Traders** —
the thread runs across several days, with the CA, the staff member and the
client all in it.

> "The conversation sits against the client, not in somebody's personal
> inbox. When a staff member leaves, the history stays with the firm."

---

### 7. The assistant — 2 min

`/ai`. The saved conversations in the sidebar. Open **"Show me overdue GST
work"** — the answer comes with the actual task rows, and each row is a link.

> "It is not writing an answer from general knowledge. It is reading this
> firm's records and showing me the rows it used, so I can check it."

Now open **"Overdue work (offline)"**:

> "This one was produced while the AI service was unreachable. The app fell
> back to its own rules, said so plainly, and still gave the right list. It
> degrades instead of breaking."

If anyone asks what stops it inventing things: every name the model returns
is checked against the real client list before it reaches a query. A name
that does not exist is dropped, not guessed at.

---

### 8. Security — 1 min · *the strongest part, if they are technical*

Switch to the Supabase SQL editor and run `supabase/tests/rls_checks.sql`.

Nine checks. The two worth reading out:

- **Test 4** — an account still on its temporary password sees **nothing at
  all**, not a reduced view.
- **Test 9** — the activity log cannot be deleted, **even by the database
  owner**.

> "Permissions are not in my code. They are in the database, so anything that
> connects to it — my app, a script, a future mobile app — gets the same
> answer."

Then, quickly: sign in as `neha@kapoor-co.test` in the private window.

> "A different firm. Same database, same tables. She sees none of it."

---

### 9. Close — 30 sec

> "One template becomes a full compliance cycle. Every file is versioned and
> approved. Every permission is enforced by the database rather than by my
> code. And the assistant answers only from the firm's own records, with the
> rows to prove it."

---

## Questions you should expect

**"What if two people edit the same thing?"**
Writes do not go through the tables directly — they go through database
functions that check the rules first. There are no write policies at all, so
there is no path around them.

**"Is the AI making this up?"**
No. It picks a tool and some filters; the filters are validated against the
real data before anything runs. If the model names a client that does not
exist, that filter is dropped and the answer says so.

**"What happens when the AI service is down?"**
It answers from keyword rules instead, and tells the user it did. Show the
saved offline conversation.

**"Can a client see another client's files?"**
No, and not because the page hides them — the database returns zero rows.
Test 2 in the security script.

**"What is not built yet?"**
Pagination, email notifications, self-service password reset, and payments.
Each one was deferred on purpose; the reasons are in
`docs/learn/10-build-from-scratch.md`.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| A screen is empty | The seed did not run. `npm run seed`. |
| Seed says data already exists | Run `supabase/reset_demo.sql`, then seed again. |
| Delete on a document errors | Migration `20260923000007_document_delete.sql` has not been run. |
| The assistant will not answer | Check `GROQ_API_KEY` in `.env.local`. The saved conversations still demonstrate it. |
| A document will not open | The signed URL expired after 5 minutes — reload the page. |

---

## What the seed creates

6 workflow templates (one archived) · 8 workflow runs · 59 tasks ·
14 document requests · 12 real files in private storage · 26 messages across
4 conversations · notifications, most of them created by database triggers ·
6 saved AI conversations · 19 activity entries.

The demo documents live in `scripts/demo-files/` and are committed to the
repository. To rebuild them, run `python3 scripts/make-demo-files.py`
(needs `reportlab` and `pillow`). You do not need to — they are already
there.

Every name, PAN, GSTIN and amount in them is invented, and each document is
footnoted as a demonstration record.
