# Demo accounts

Every account below is created by `npm run seed`. They are fictitious, and all of them
use the same password: **the value of `DEMO_PASSWORD` in your `.env.local`**.

The password itself is deliberately not written here, so this file is safe to commit and
safe to show on a projector. Look it up with:

```powershell
type .env.local
```

App: <http://localhost:3000>

## Firm: Sharma & Associates (the firm you demo)

| Role | Email | What it can see and do |
|---|---|---|
| CA / Admin | `anil@sharma-associates.test` | Everything in the firm: clients, staff, all tasks, workflow templates, document review, every conversation |
| Staff | `rahul@sharma-associates.test` | Only ABC Traders and XYZ Pvt Ltd, and only his own tasks |
| Staff | `priya@sharma-associates.test` | Only XYZ Pvt Ltd and Om Services |
| Staff | `amit@sharma-associates.test` | Only Raj Enterprises |
| Client | `rajesh@abctraders.test` | ABC Traders only. **Starts on a temporary password**, so the first sign-in forces a password change |
| Client | `meera@xyzpvt.test` | XYZ Pvt Ltd only |

## Second firm: Kapoor & Co. (proves firm isolation)

| Role | Email | Purpose |
|---|---|---|
| CA / Admin | `neha@kapoor-co.test` | Sign in here to show that none of Sharma & Associates' data is visible |

## Demo route that shows the whole product

1. **`anil@`** — dashboard, then Workflows → open a template → Generate workflow for ABC Traders.
2. Still as **`anil@`** — the generated tasks and document requests appear; message the client from a task.
3. **`rajesh@`** — set a new password, see the documents needed, upload one, reply to the message.
4. **`anil@`** — reject the upload with a reason.
5. **`rajesh@`** — see the reason, upload version 2.
6. **`anil@`** — accept version 2, then approve the reviewed task.
7. **`rahul@`** — show that he sees only his own clients and cannot approve his own work.
8. **`neha@`** — show that another firm's account sees nothing of the above.

## Accounts created inside the app

When the CA adds a staff member or a client login, the app generates a **one-time
temporary password** and shows it once, on screen, right after creation. It is never
stored in readable form and never shown again — the CA passes it to the person directly,
and they must set their own password at first sign-in.

If someone loses that temporary password, create the reset from Supabase
(Authentication → Users → the user → Reset password), not from a note in this repo.

## Rules for this file

- Never write a real password, service-role key or API key here.
- These `.test` accounts exist only in your development Supabase project. Do not reuse
  this pattern, or a shared password, for anything real.
