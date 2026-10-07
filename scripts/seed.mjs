// Seeds fictitious demo data.  Run with:  npm run seed
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD in .env.local
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const demoPassword = process.env.DEMO_PASSWORD;

if (!url || !serviceKey || !demoPassword) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD in .env.local first.");
  process.exit(1);
}
if (demoPassword.length < 8) {
  console.error("DEMO_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const DAY = 864e5;

function must(result, what) {
  if (result.error) {
    console.error(`Failed: ${what}\n`, result.error);
    process.exit(1);
  }
  return result.data;
}

/** YYYY-MM-DD in IST, `days` from today, due at 5 PM IST. */
function dueIn(days) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + days * DAY));
  return `${d}T17:00:00+05:30`;
}
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

// ---------------------------------------------------------------- guard
const existing = must(await db.from("firms").select("id").eq("name", "Sharma & Associates"), "check existing");
if (existing.length) {
  console.log("Demo data already exists (firm 'Sharma & Associates'). Nothing to do.");
  console.log("To start over, run supabase/reset_demo.sql in the SQL editor, then seed again.");
  process.exit(0);
}

// ---------------------------------------------------------------- firms
const [firm, otherFirm] = must(
  await db.from("firms").insert([{ name: "Sharma & Associates" }, { name: "Kapoor & Co." }]).select(),
  "create firms",
);

// ---------------------------------------------------------------- users
async function makeUser({ firm_id, name, email, role, mustChange = false }) {
  const created = await db.auth.admin.createUser({
    email,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { name },
  });
  if (created.error) {
    console.error(`Failed to create auth user ${email}:`, created.error.message);
    process.exit(1);
  }
  const id = created.data.user.id;
  must(
    await db.from("users").insert({ id, firm_id, name, email, role, must_change_password: mustChange }),
    `create profile ${email}`,
  );
  return id;
}

const admin = await makeUser({ firm_id: firm.id, name: "CA Anil Sharma", email: "anil@sharma-associates.test", role: "ADMIN" });
const rahul = await makeUser({ firm_id: firm.id, name: "Rahul Mehta", email: "rahul@sharma-associates.test", role: "STAFF" });
const amit = await makeUser({ firm_id: firm.id, name: "Amit Shah", email: "amit@sharma-associates.test", role: "STAFF" });
const priya = await makeUser({ firm_id: firm.id, name: "Priya Nair", email: "priya@sharma-associates.test", role: "STAFF" });
const otherAdmin = await makeUser({ firm_id: otherFirm.id, name: "CA Neha Kapoor", email: "neha@kapoor-co.test", role: "ADMIN" });

// ---------------------------------------------------------------- clients
const clientRows = must(
  await db.from("clients").insert([
    { firm_id: firm.id, name: "ABC Traders", email: "rajesh@abctraders.test", phone: "9820012345", pan: "ABCPG1234K", gstin: "27ABCPG1234K1Z5", business_type: "Proprietorship" },
    { firm_id: firm.id, name: "XYZ Pvt Ltd", email: "meera@xyzpvt.test", phone: "9822098765", pan: "AABCX5678L", gstin: "27AABCX5678L1Z2", business_type: "Private Limited" },
    { firm_id: firm.id, name: "Raj Enterprises", email: "accounts@rajent.test", phone: "9890011223", pan: "AAFFR9012M", business_type: "Partnership" },
    { firm_id: firm.id, name: "Om Services", email: "om@omservices.test", phone: "9767700112", pan: "AOMPS3456N", gstin: "27AOMPS3456N1Z8", business_type: "Proprietorship" },
    { firm_id: otherFirm.id, name: "Kapoor Textiles", email: "hello@kapoortex.test", business_type: "Private Limited" },
  ]).select(),
  "create clients",
);
const C = Object.fromEntries(clientRows.map((c) => [c.name, c.id]));

// Client logins: ABC must change its password on first sign-in.
const abcUser = await makeUser({ firm_id: firm.id, name: "Rajesh Gupta", email: "rajesh@abctraders.test", role: "CLIENT", mustChange: true });
const xyzUser = await makeUser({ firm_id: firm.id, name: "Meera Iyer", email: "meera@xyzpvt.test", role: "CLIENT" });
must(
  await db.from("client_users").insert([
    { user_id: abcUser, client_id: C["ABC Traders"] },
    { user_id: xyzUser, client_id: C["XYZ Pvt Ltd"] },
  ]),
  "link client logins",
);

// ---------------------------------------------------------------- assignments
must(
  await db.from("client_staff").insert([
    { client_id: C["ABC Traders"], staff_id: rahul, assigned_by: admin },
    { client_id: C["XYZ Pvt Ltd"], staff_id: rahul, assigned_by: admin },
    { client_id: C["XYZ Pvt Ltd"], staff_id: priya, assigned_by: admin },
    { client_id: C["Om Services"], staff_id: priya, assigned_by: admin },
    { client_id: C["Raj Enterprises"], staff_id: amit, assigned_by: admin },
  ]),
  "assign staff",
);

// ---------------------------------------------------------------- tasks
const services = must(await db.from("services").select("id, name"), "load services");
const S = Object.fromEntries(services.map((s) => [s.name, s.id]));

function task(client, service, period, title, assigned_to, status, priority, days, requires_review = true, firm_id = firm.id, created_by = admin) {
  const now = new Date().toISOString();
  return {
    firm_id, client_id: C[client], service_id: S[service], financial_year: "2026-27", period, title,
    assigned_to, status, priority, due_date: dueIn(days), requires_review, created_by,
    started_at: status === "TODO" ? null : now,
    completed_at: status === "COMPLETED" ? now : null,
  };
}

const tasks = must(
  await db.from("tasks").insert([
    task("ABC Traders", "GST", "September 2026", "Collect sales invoices", rahul, "COMPLETED", "MEDIUM", -3, false),
    task("ABC Traders", "GST", "September 2026", "Prepare GST data", rahul, "UNDER_REVIEW", "HIGH", 1),
    task("ABC Traders", "GST", "September 2026", "File GSTR-3B", rahul, "TODO", "HIGH", 4),
    task("ABC Traders", "TDS", "Q2 FY 2026-27", "Collect TDS data", rahul, "TODO", "HIGH", -1, false),
    task("XYZ Pvt Ltd", "TDS", "Q2 FY 2026-27", "Collect TDS data", priya, "WAITING_FOR_CLIENT", "HIGH", -2, false),
    task("XYZ Pvt Ltd", "TDS", "Q2 FY 2026-27", "Prepare TDS working", rahul, "TODO", "MEDIUM", 5),
    task("XYZ Pvt Ltd", "GST", "September 2026", "Collect purchase bills", priya, "WAITING_FOR_CLIENT", "MEDIUM", 2, false),
    task("Raj Enterprises", "Income Tax", "Annual", "Prepare income tax return", amit, "COMPLETED", "MEDIUM", -10),
    task("Raj Enterprises", "Income Tax", "Annual", "Upload acknowledgement", amit, "COMPLETED", "LOW", -8, false),
    task("Om Services", "Bookkeeping", "September 2026", "Record bank entries", priya, "IN_PROGRESS", "MEDIUM", 0, false),
    task("Om Services", "Bookkeeping", "September 2026", "Reconcile ledger", priya, "IN_PROGRESS", "MEDIUM", -1),
    task("Om Services", "Bookkeeping", "September 2026", "Month-end review", null, "TODO", "LOW", 6),
    task("Kapoor Textiles", "GST", "September 2026", "Prepare GST data", otherAdmin, "TODO", "HIGH", 3, true, otherFirm.id, otherAdmin),
  ]).select("id, title, client_id"),
  "create tasks",
);
const T = (clientName, title) => tasks.find((t) => t.client_id === C[clientName] && t.title === title).id;

// ---------------------------------------------------------------- history
const log = (mins, user_id, client, entity_type, entity_id, action, description) => ({
  firm_id: firm.id, user_id, client_id: C[client], entity_type, entity_id, action, description, created_at: minutesAgo(mins),
});
must(
  await db.from("activity_logs").insert([
    log(4400, admin, "ABC Traders", "client", C["ABC Traders"], "CLIENT_CREATED", "Created client ABC Traders"),
    log(4390, admin, "ABC Traders", "client", C["ABC Traders"], "STAFF_ASSIGNED", "Assigned Rahul Mehta to ABC Traders"),
    log(4380, admin, "XYZ Pvt Ltd", "client", C["XYZ Pvt Ltd"], "STAFF_ASSIGNED", "Assigned Priya Nair to XYZ Pvt Ltd"),
    log(2900, admin, "ABC Traders", "task", T("ABC Traders", "Prepare GST data"), "TASK_CREATED", 'Created task "Prepare GST data" and assigned it to Rahul Mehta'),
    log(1500, amit, "Raj Enterprises", "task", T("Raj Enterprises", "Prepare income tax return"), "TASK_STATUS_CHANGED", 'Changed "Prepare income tax return" from Under review to Completed'),
    log(320, priya, "XYZ Pvt Ltd", "task", T("XYZ Pvt Ltd", "Collect TDS data"), "TASK_STATUS_CHANGED", 'Changed "Collect TDS data" from In progress to Waiting for client'),
    log(95, rahul, "ABC Traders", "task", T("ABC Traders", "Prepare GST data"), "TASK_STATUS_CHANGED", 'Changed "Prepare GST data" from In progress to Under review'),
  ]),
  "create activity",
);

console.log(`
Demo data created. All accounts use the DEMO_PASSWORD from .env.local.

  CA / Admin        anil@sharma-associates.test
  Staff             rahul@sharma-associates.test
  Staff             priya@sharma-associates.test
  Staff             amit@sharma-associates.test
  Client (first     rajesh@abctraders.test   -> must change password
   sign-in)
  Client            meera@xyzpvt.test
  Other firm admin  neha@kapoor-co.test      -> for the tenant-isolation test
`);
