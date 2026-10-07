// Seeds a full, demonstrable set of fictitious data.  Run with:  npm run seed
//
// Everything created here is invented: the firms, the people, the PANs, the
// amounts and the documents in scripts/demo-files/. Nothing is a real record.
//
// After this runs, every screen in the app has something on it: templates with
// steps, workflows part-finished, documents actually uploaded to storage in
// every review state, conversations, notifications and saved AI answers.
//
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// DEMO_PASSWORD in .env.local
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

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
const FILES = join(dirname(fileURLToPath(import.meta.url)), "demo-files");
const BUCKET = "client-documents";

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
const daysAgo = (d) => new Date(Date.now() - d * DAY).toISOString();
const step = (msg) => process.stdout.write(`  ${msg}\n`);

// ---------------------------------------------------------------- guard
const existing = must(await db.from("firms").select("id").eq("name", "Sharma & Associates"), "check existing");
if (existing.length) {
  console.log("Demo data already exists (firm 'Sharma & Associates'). Nothing to do.");
  console.log("To start over, run supabase/reset_demo.sql in the SQL editor, then seed again.");
  process.exit(0);
}

console.log("\nSeeding demo data.\n");

// ---------------------------------------------------------------- storage
// Supabase refuses `delete from storage.objects` in SQL, so reset_demo.sql
// cannot clear the bucket and this does it instead. Anything still in here
// is an orphan from an earlier demo: its database row is already gone.
async function emptyBucket() {
  const walk = async (prefix) => {
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000 });
    if (error || !data) return [];
    const found = [];
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A listing entry with no id is a folder, not a file.
      if (entry.id === null) found.push(...(await walk(path)));
      else found.push(path);
    }
    return found;
  };

  const paths = await walk("");
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) {
      console.error("Could not clear the storage bucket:", error.message);
      process.exit(1);
    }
  }
  if (paths.length) step(`cleared ${paths.length} leftover file(s) from storage`);
}
await emptyBucket();

// ---------------------------------------------------------------- firms
const [firm, otherFirm] = must(
  await db.from("firms").insert([{ name: "Sharma & Associates" }, { name: "Kapoor & Co." }]).select(),
  "create firms",
);
step("2 firms");

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
const sneha = await makeUser({ firm_id: firm.id, name: "Sneha Kulkarni", email: "sneha@sharma-associates.test", role: "STAFF" });
const otherAdmin = await makeUser({ firm_id: otherFirm.id, name: "CA Neha Kapoor", email: "neha@kapoor-co.test", role: "ADMIN" });
step("6 staff accounts");

// ---------------------------------------------------------------- clients
const clientRows = must(
  // Every row must carry the SAME keys. PostgREST turns an array insert into
  // one multi-row INSERT using the union of all the keys, and a row missing a
  // key gets an explicit NULL rather than the column default — so listing
  // `status` on one row only would push NULL into a not-null column on all
  // the others. Nullable columns (gstin, pan, phone) are spelled out for the
  // same reason: to keep the shape identical.
  await db.from("clients").insert([
    { firm_id: firm.id, name: "ABC Traders", email: "rajesh@abctraders.test", phone: "9820012345", pan: "ABCPG1234K", gstin: "27ABCPG1234K1Z5", business_type: "Proprietorship", status: "ACTIVE" },
    { firm_id: firm.id, name: "XYZ Pvt Ltd", email: "meera@xyzpvt.test", phone: "9822098765", pan: "AABCX5678L", gstin: "27AABCX5678L1Z2", business_type: "Private Limited", status: "ACTIVE" },
    { firm_id: firm.id, name: "Raj Enterprises", email: "accounts@rajent.test", phone: "9890011223", pan: "AAFFR9012M", gstin: null, business_type: "Partnership", status: "ACTIVE" },
    { firm_id: firm.id, name: "Om Services", email: "om@omservices.test", phone: "9767700112", pan: "AOMPS3456N", gstin: "27AOMPS3456N1Z8", business_type: "Proprietorship", status: "ACTIVE" },
    { firm_id: firm.id, name: "Vertex Solutions LLP", email: "finance@vertexllp.test", phone: "9730044556", pan: "AAVFV5566R", gstin: "27AAVFV5566R1Z4", business_type: "LLP", status: "ACTIVE" },
    { firm_id: firm.id, name: "Nandini Dairy Farm", email: "nandini@nandinidairy.test", phone: "9604455667", pan: "ANDPD7788P", gstin: null, business_type: "Proprietorship", status: "INACTIVE" },
    { firm_id: otherFirm.id, name: "Kapoor Textiles", email: "hello@kapoortex.test", phone: null, pan: null, gstin: null, business_type: "Private Limited", status: "ACTIVE" },
  ]).select(),
  "create clients",
);
const C = Object.fromEntries(clientRows.map((c) => [c.name, c.id]));
step("7 clients (one inactive, one in the other firm)");

// Client logins. ABC must change its password on first sign-in.
const abcUser = await makeUser({ firm_id: firm.id, name: "Rajesh Gupta", email: "rajesh@abctraders.test", role: "CLIENT", mustChange: true });
const xyzUser = await makeUser({ firm_id: firm.id, name: "Meera Iyer", email: "meera@xyzpvt.test", role: "CLIENT" });
const omUser = await makeUser({ firm_id: firm.id, name: "Omkar Joshi", email: "om@omservices.test", role: "CLIENT" });
const rajUser = await makeUser({ firm_id: firm.id, name: "Sanjay Raj", email: "accounts@rajent.test", role: "CLIENT" });
must(
  await db.from("client_users").insert([
    { user_id: abcUser, client_id: C["ABC Traders"] },
    { user_id: xyzUser, client_id: C["XYZ Pvt Ltd"] },
    { user_id: omUser, client_id: C["Om Services"] },
    { user_id: rajUser, client_id: C["Raj Enterprises"] },
  ]),
  "link client logins",
);
step("4 client logins");

// ---------------------------------------------------------------- assignments
must(
  await db.from("client_staff").insert([
    { client_id: C["ABC Traders"], staff_id: rahul, assigned_by: admin },
    { client_id: C["XYZ Pvt Ltd"], staff_id: rahul, assigned_by: admin },
    { client_id: C["XYZ Pvt Ltd"], staff_id: priya, assigned_by: admin },
    { client_id: C["Om Services"], staff_id: priya, assigned_by: admin },
    { client_id: C["Raj Enterprises"], staff_id: amit, assigned_by: admin },
    { client_id: C["Vertex Solutions LLP"], staff_id: sneha, assigned_by: admin },
    { client_id: C["Vertex Solutions LLP"], staff_id: amit, assigned_by: admin },
  ]),
  "assign staff",
);

const services = must(await db.from("services").select("id, name"), "load services");
const S = Object.fromEntries(services.map((s) => [s.name, s.id]));

// ================================================================
// Workflow templates
// ================================================================
async function makeTemplate(name, serviceName, description, steps, isActive = true) {
  const [tpl] = must(
    await db.from("workflow_templates")
      .insert({ firm_id: firm.id, service_id: S[serviceName], name, description, created_by: admin, is_active: isActive })
      .select(),
    `create template ${name}`,
  );
  must(
    await db.from("workflow_template_steps").insert(
      steps.map((s, i) => ({
        template_id: tpl.id,
        position: i + 1,
        title: s.title,
        requires_document: !!s.document,
        requires_review: !!s.review,
        due_offset_days: s.offset ?? 0,
      })),
    ),
    `create steps for ${name}`,
  );
  return { id: tpl.id, name, service: serviceName, steps };
}

const TPL = {};
TPL.gst = await makeTemplate("GST Monthly", "GST", "Monthly GST return cycle for one client.", [
  { title: "Collect sales and purchase invoices", document: true, offset: 0 },
  { title: "Reconcile purchases against GSTR-2B", offset: 2 },
  { title: "Compute the tax payable", offset: 3 },
  { title: "Confirm the summary with the client", review: true, offset: 4 },
  { title: "Pay the tax", offset: 5 },
  { title: "File GSTR-1", offset: 8 },
  { title: "File GSTR-3B and save the acknowledgement", review: true, document: true, offset: 10 },
]);
TPL.tds = await makeTemplate("TDS Quarterly", "TDS", "Quarterly TDS working, payment and return.", [
  { title: "Collect the quarter's deduction details", document: true, offset: 0 },
  { title: "Verify every deductee PAN", offset: 2 },
  { title: "Compute TDS payable with interest", offset: 4 },
  { title: "Deposit the challans", offset: 6 },
  { title: "Prepare and validate the quarterly return", review: true, offset: 10 },
  { title: "File the return and issue Form 16A", document: true, offset: 14 },
]);
TPL.itr = await makeTemplate("Income Tax Return", "Income Tax", "Annual return, from proofs to acknowledgement.", [
  { title: "Collect Form 16, bank statements and investment proofs", document: true, offset: 0 },
  { title: "Collect last year's return and the books", document: true, offset: 2 },
  { title: "Reconcile with AIS and Form 26AS", offset: 5 },
  { title: "Compute total income and deductions", offset: 8 },
  { title: "Put the computation sheet up for review", review: true, offset: 11 },
  { title: "Get the client's written confirmation", offset: 14 },
  { title: "File the return", offset: 18 },
  { title: "E-verify and save the acknowledgement", review: true, document: true, offset: 20 },
]);
TPL.audit = await makeTemplate("Statutory Audit", "Audit", "Books to signed report, for a company audit.", [
  { title: "Collect trial balance, ledgers and bank statements", document: true, offset: 0 },
  { title: "Vouch expenses and verify balances", offset: 6 },
  { title: "Check statutory dues and compliances", offset: 12 },
  { title: "Obtain management representation letter", document: true, offset: 16 },
  { title: "Draft the financial statements", offset: 20 },
  { title: "Partner review of the draft report", review: true, offset: 25 },
  { title: "Sign and issue the audit report", review: true, offset: 30 },
]);
TPL.payroll = await makeTemplate("Payroll Monthly", "Payroll", "Salary processing and statutory dues.", [
  { title: "Collect attendance and any salary revisions", document: true, offset: 0 },
  { title: "Prepare the salary register", offset: 2 },
  { title: "Compute PF, ESIC and professional tax", offset: 3 },
  { title: "Share the register for approval", review: true, offset: 4 },
  { title: "Pay salaries and file the challans", offset: 7 },
]);
// Kept archived, so the "Show archived" filter has something to show.
TPL.old = await makeTemplate("GST Monthly (old format)", "GST", "Superseded by GST Monthly in April 2026.", [
  { title: "Collect invoices", document: true, offset: 0 },
  { title: "Prepare the return", offset: 4 },
  { title: "File GSTR-3B", offset: 8 },
], false);
step("6 workflow templates (one archived)");

// ================================================================
// Workflow runs — the generated cycles, part finished
// ================================================================

/**
 * Creates a run and the tasks it generated, exactly as generate_workflow()
 * would have, then sets each task to the status the demo needs.
 * `plan` is one status per step, and `startedDaysAgo` places the cycle in time.
 */
async function makeRun({ tpl, client, fy = "2026-27", period, startedDaysAgo, plan, owner, status = "ACTIVE" }) {
  const [run] = must(
    await db.from("workflow_runs").insert({
      firm_id: firm.id,
      client_id: C[client],
      template_id: tpl.id,
      service_id: S[tpl.service],
      template_name: tpl.name,
      financial_year: fy,
      period,
      status,
      created_by: admin,
      created_at: daysAgo(startedDaysAgo),
      completed_at: status === "COMPLETED" ? daysAgo(Math.max(0, startedDaysAgo - 24)) : null,
    }).select(),
    `create run ${tpl.name} / ${client}`,
  );

  const rows = tpl.steps.map((s, i) => {
    const st = plan[i] ?? "TODO";
    const dueDays = (s.offset ?? 0) - startedDaysAgo;
    return {
      firm_id: firm.id,
      client_id: C[client],
      service_id: S[tpl.service],
      workflow_run_id: run.id,
      workflow_step_no: i + 1,
      needs_document: !!s.document,
      financial_year: fy,
      period,
      title: s.title,
      assigned_to: owner,
      status: st,
      priority: i === tpl.steps.length - 1 ? "HIGH" : "MEDIUM",
      requires_review: !!s.review,
      due_date: dueIn(dueDays),
      created_by: admin,
      created_at: daysAgo(startedDaysAgo),
      started_at: st === "TODO" ? null : daysAgo(Math.max(0, startedDaysAgo - (s.offset ?? 0))),
      completed_at: st === "COMPLETED" ? daysAgo(Math.max(0, startedDaysAgo - (s.offset ?? 0) - 1)) : null,
    };
  });

  const tasks = must(await db.from("tasks").insert(rows).select("id, title, workflow_step_no"), `run tasks ${tpl.name}`);
  return { id: run.id, client, period, tasks, taskAt: (n) => tasks.find((t) => t.workflow_step_no === n).id };
}

const RUN = {};
// ABC's September GST: well under way, one step under review.
RUN.abcGst = await makeRun({
  tpl: TPL.gst, client: "ABC Traders", period: "September 2026", startedDaysAgo: 12, owner: rahul,
  plan: ["COMPLETED", "COMPLETED", "COMPLETED", "UNDER_REVIEW", "TODO", "TODO", "TODO"],
});
// XYZ's September GST: just started, waiting on the client.
RUN.xyzGst = await makeRun({
  tpl: TPL.gst, client: "XYZ Pvt Ltd", period: "September 2026", startedDaysAgo: 6, owner: priya,
  plan: ["WAITING_FOR_CLIENT", "TODO", "TODO", "TODO", "TODO", "TODO", "TODO"],
});
// Om Services' Q2 TDS: nearly done.
RUN.omTds = await makeRun({
  tpl: TPL.tds, client: "Om Services", period: "Q2 FY 2026-27", startedDaysAgo: 16, owner: priya,
  plan: ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "UNDER_REVIEW", "TODO"],
});
// XYZ's Q1 TDS: finished and closed. This is the 100% ring in the demo.
RUN.xyzTds = await makeRun({
  tpl: TPL.tds, client: "XYZ Pvt Ltd", period: "Q1 FY 2026-27", startedDaysAgo: 96, owner: rahul,
  status: "COMPLETED",
  plan: ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED"],
});
// Raj Enterprises' return: filed, closed.
RUN.rajItr = await makeRun({
  tpl: TPL.itr, client: "Raj Enterprises", period: "AY 2026-27", startedDaysAgo: 34, owner: amit,
  status: "COMPLETED",
  plan: ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED"],
});
// Vertex's audit: mid-engagement, the longest cycle.
RUN.vertexAudit = await makeRun({
  tpl: TPL.audit, client: "Vertex Solutions LLP", period: "FY 2025-26", startedDaysAgo: 18, owner: sneha,
  plan: ["COMPLETED", "COMPLETED", "IN_PROGRESS", "WAITING_FOR_CLIENT", "TODO", "TODO", "TODO"],
});
// Om Services' payroll: this month, half done.
RUN.omPayroll = await makeRun({
  tpl: TPL.payroll, client: "Om Services", period: "September 2026", startedDaysAgo: 5, owner: priya,
  plan: ["COMPLETED", "COMPLETED", "IN_PROGRESS", "TODO", "TODO"],
});
// One cancelled cycle, so the Cancelled badge appears somewhere.
RUN.abcAug = await makeRun({
  tpl: TPL.old, client: "ABC Traders", period: "August 2026", startedDaysAgo: 44, owner: rahul,
  status: "CANCELLED",
  plan: ["COMPLETED", "CANCELLED", "CANCELLED"],
});
step("8 workflow runs, 50 generated tasks");

// ---------------------------------------------------------------- ad-hoc tasks
// Not everything comes from a template: these are the one-off jobs.
function adhoc(client, service, period, title, assigned_to, status, priority, days, requires_review = true) {
  const now = new Date().toISOString();
  return {
    firm_id: firm.id, client_id: C[client], service_id: S[service], financial_year: "2026-27", period, title,
    assigned_to, status, priority, due_date: dueIn(days), requires_review, created_by: admin,
    started_at: status === "TODO" ? null : now,
    completed_at: status === "COMPLETED" ? now : null,
  };
}
const adhocTasks = must(
  await db.from("tasks").insert([
    adhoc("Om Services", "Bookkeeping", "September 2026", "Record September bank entries", priya, "IN_PROGRESS", "MEDIUM", 0, false),
    adhoc("Om Services", "Bookkeeping", "September 2026", "Reconcile the ledger", priya, "IN_PROGRESS", "MEDIUM", -1),
    adhoc("Om Services", "Bookkeeping", "September 2026", "Month-end review", null, "TODO", "LOW", 6),
    adhoc("ABC Traders", "Other", "September 2026", "Reply to the GST notice for FY 2024-25", rahul, "TODO", "HIGH", -2),
    adhoc("Raj Enterprises", "MCA / ROC Compliance", "FY 2025-26", "File AOC-4", amit, "TODO", "HIGH", 9),
    adhoc("Raj Enterprises", "MCA / ROC Compliance", "FY 2025-26", "File MGT-7", amit, "TODO", "MEDIUM", 12),
    adhoc("Vertex Solutions LLP", "Other", "September 2026", "Advise on the new partner admission", sneha, "UNDER_REVIEW", "MEDIUM", 3),
    adhoc("XYZ Pvt Ltd", "Bookkeeping", "September 2026", "Post the September journal entries", priya, "TODO", "LOW", 8, false),
    {
      firm_id: otherFirm.id, client_id: C["Kapoor Textiles"], service_id: S["GST"], financial_year: "2026-27",
      period: "September 2026", title: "Prepare GST data", assigned_to: otherAdmin, status: "TODO",
      priority: "HIGH", due_date: dueIn(3), requires_review: true, created_by: otherAdmin,
      started_at: null, completed_at: null,
    },
  ]).select("id, title"),
  "create ad-hoc tasks",
);
/** The one overdue task in the whole firm — it gets pointed at from several places. */
const noticeTask = adhocTasks.find((t) => t.title.startsWith("Reply to the GST notice")).id;
step("9 ad-hoc tasks");

// ================================================================
// Documents: real files, uploaded to private storage
// ================================================================

const EXT_MIME = {
  pdf: "application/pdf",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
};

/** Uploads one demo file and records the document row, as the app does. */
async function upload({ request, client, fileName, version, status, by, reviewer, reason, uploadedDaysAgo }) {
  const ext = fileName.split(".").pop().toLowerCase();
  const bytes = await readFile(join(FILES, fileName)).catch(() => null);
  if (!bytes) {
    console.error(`Missing demo file scripts/demo-files/${fileName}. Run: python3 scripts/make-demo-files.py`);
    process.exit(1);
  }
  const path = `${C[client]}/${request}/${version}-${randomUUID().slice(0, 8)}.${ext}`;
  const up = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: EXT_MIME[ext] ?? "application/octet-stream",
    upsert: true,
  });
  if (up.error) {
    console.error(`Failed to upload ${fileName}:`, up.error.message);
    process.exit(1);
  }
  must(
    await db.from("documents").insert({
      firm_id: firm.id,
      request_id: request,
      client_id: C[client],
      version,
      file_name: fileName,
      storage_path: path,
      mime_type: EXT_MIME[ext] ?? null,
      size_bytes: bytes.length,
      status,
      uploaded_by: by,
      uploaded_at: daysAgo(uploadedDaysAgo),
      reviewed_by: reviewer ?? null,
      reviewed_at: reviewer ? daysAgo(Math.max(0, uploadedDaysAgo - 1)) : null,
      rejection_reason: reason ?? null,
    }),
    `record document ${fileName}`,
  );
  return path;
}

async function request({ client, title, description, taskId, runId, period = "September 2026", status,
                        dueDays, createdBy = admin, reason, files = [] }) {
  const [req] = must(
    await db.from("document_requests").insert({
      firm_id: firm.id,
      client_id: C[client],
      task_id: taskId ?? null,
      workflow_run_id: runId ?? null,
      financial_year: "2026-27",
      period,
      title,
      description: description ?? null,
      due_date: dueIn(dueDays),
      status,
      rejection_reason: reason ?? null,
      created_by: createdBy,
      created_at: daysAgo(Math.max(1, 10 - dueDays)),
    }).select(),
    `create request ${title}`,
  );
  for (const f of files) await upload({ ...f, request: req.id, client });
  return req.id;
}

// Accepted: the happy path, twice over.
await request({
  client: "ABC Traders", title: "September sales invoices",
  description: "All invoices raised in September, in one PDF if possible.",
  taskId: RUN.abcGst.taskAt(1), runId: RUN.abcGst.id, status: "ACCEPTED", dueDays: -8,
  files: [{ fileName: "sales-invoices-sep-2026.pdf", version: 1, status: "ACCEPTED", by: abcUser, reviewer: rahul, uploadedDaysAgo: 9 }],
});
await request({
  client: "ABC Traders", title: "September purchase bills",
  description: "Including the bills that were pending from August.",
  taskId: RUN.abcGst.taskAt(1), runId: RUN.abcGst.id, status: "ACCEPTED", dueDays: -8,
  files: [{ fileName: "purchase-bills-sep-2026.pdf", version: 1, status: "ACCEPTED", by: abcUser, reviewer: rahul, uploadedDaysAgo: 9 }],
});

// Waiting for the CA to look at it.
await request({
  client: "ABC Traders", title: "September bank statement",
  description: "All pages, including the closing summary.",
  runId: RUN.abcGst.id, status: "UNDER_REVIEW", dueDays: -2,
  files: [{ fileName: "bank-statement-sep-2026.pdf", version: 1, status: "UPLOADED", by: abcUser, uploadedDaysAgo: 2 }],
});

// Rejected, then put right: version 1 unreadable, version 2 fine.
await request({
  client: "ABC Traders", title: "Cancelled cheque for the refund account",
  description: "Needed for the GST refund application. A clear photo is fine.",
  status: "UPLOADED", dueDays: 1,
  files: [
    {
      fileName: "invoice-scan-unreadable.jpg", version: 1, status: "REJECTED", by: abcUser, reviewer: admin,
      reason: "The image is out of focus and the account number cannot be read. Please retake it in good light, with the whole cheque in frame.",
      uploadedDaysAgo: 4,
    },
    { fileName: "cancelled-cheque.png", version: 2, status: "UPLOADED", by: abcUser, uploadedDaysAgo: 1 },
  ],
});

// Filed proof, accepted.
await request({
  client: "ABC Traders", title: "GSTR-3B acknowledgement, August 2026",
  period: "August 2026", status: "ACCEPTED", dueDays: -20, createdBy: rahul,
  files: [{ fileName: "gstr3b-acknowledgement-sep-2026.pdf", version: 1, status: "ACCEPTED", by: rahul, reviewer: admin, uploadedDaysAgo: 21 }],
});

// XYZ.
await request({
  client: "XYZ Pvt Ltd", title: "TDS deduction details for Q2",
  description: "Deductee name, PAN, section, amount and date for every payment.",
  taskId: RUN.xyzGst.taskAt(1), status: "ACCEPTED", dueDays: -5,
  period: "Q2 FY 2026-27",
  files: [{ fileName: "tds-deductions-q2-fy2026-27.csv", version: 1, status: "ACCEPTED", by: xyzUser, reviewer: priya, uploadedDaysAgo: 6 }],
});
await request({
  client: "XYZ Pvt Ltd", title: "Board resolution authorising us to file",
  description: "Certified true copy, signed by a director.",
  status: "ACCEPTED", dueDays: -12,
  files: [{ fileName: "board-resolution-fy2025-26.pdf", version: 1, status: "ACCEPTED", by: xyzUser, reviewer: admin, uploadedDaysAgo: 13 }],
});
await request({
  client: "XYZ Pvt Ltd", title: "Form 16A issued for Q1",
  period: "Q1 FY 2026-27", runId: RUN.xyzTds.id, taskId: RUN.xyzTds.taskAt(6),
  status: "ACCEPTED", dueDays: -60, createdBy: rahul,
  files: [{ fileName: "form-16a-q1-fy2026-27.pdf", version: 1, status: "ACCEPTED", by: rahul, reviewer: admin, uploadedDaysAgo: 61 }],
});

// Raj Enterprises: the finished return.
await request({
  client: "Raj Enterprises", title: "Trial balance as at 31 March 2026",
  period: "AY 2026-27", runId: RUN.rajItr.id, taskId: RUN.rajItr.taskAt(2),
  status: "ACCEPTED", dueDays: -30,
  files: [{ fileName: "trial-balance-mar-2026.csv", version: 1, status: "ACCEPTED", by: rajUser, reviewer: amit, uploadedDaysAgo: 31 }],
});
await request({
  client: "Raj Enterprises", title: "ITR-V acknowledgement",
  period: "AY 2026-27", runId: RUN.rajItr.id, taskId: RUN.rajItr.taskAt(8),
  status: "ACCEPTED", dueDays: -4, createdBy: amit,
  files: [{ fileName: "itr-v-acknowledgement-ay2026-27.pdf", version: 1, status: "ACCEPTED", by: amit, reviewer: admin, uploadedDaysAgo: 4 }],
});

// Om Services: one under review, one still outstanding.
await request({
  client: "Om Services", title: "September salary register",
  description: "With PF and professional tax columns.",
  runId: RUN.omPayroll.id, taskId: RUN.omPayroll.taskAt(1),
  status: "UNDER_REVIEW", dueDays: -1,
  files: [{ fileName: "salary-register-sep-2026.csv", version: 1, status: "UPLOADED", by: omUser, uploadedDaysAgo: 1 }],
});
await request({
  client: "Om Services", title: "September bank statement",
  description: "All pages, including the closing summary.",
  status: "REQUESTED", dueDays: 2,
});
await request({
  client: "Vertex Solutions LLP", title: "Management representation letter",
  description: "On your letterhead, signed by a designated partner.",
  period: "FY 2025-26", runId: RUN.vertexAudit.id, taskId: RUN.vertexAudit.taskAt(4),
  status: "REQUESTED", dueDays: 3, createdBy: sneha,
});
// Cancelled, so that state is visible too.
await request({
  client: "Nandini Dairy Farm", title: "Old registration certificate",
  description: "No longer needed; the client has stopped trading.",
  status: "CANCELLED", dueDays: -15,
});
step("14 document requests, 12 files uploaded to storage");

// ================================================================
// Messages: four conversations, spread over several days
// ================================================================
const msg = (client, sender, message, minsAgo, task_id = null) => ({
  firm_id: firm.id, client_id: C[client], sender_id: sender, task_id, message, created_at: minutesAgo(minsAgo),
});

must(
  await db.from("messages").insert([
    // ABC Traders — the fullest thread, crossing several days.
    msg("ABC Traders", admin, "Hello Rajesh, we've started the September GST cycle. Please upload the sales and purchase invoices when you can.", 8600),
    msg("ABC Traders", abcUser, "Thanks sir. I'll send the sales ones today. Purchase bills may take till Friday, a few suppliers haven't sent theirs.", 8480),
    msg("ABC Traders", rahul, "That's fine. Friday still leaves us room before the 20th.", 8400),
    msg("ABC Traders", abcUser, "Uploaded the sales invoice register now. 12 invoices, total around 28 lakh.", 7200),
    msg("ABC Traders", rahul, "Received, thank you. Figures tie with what you told us on the call.", 7100),
    msg("ABC Traders", abcUser, "Purchase bills are up as well.", 4380),
    msg("ABC Traders", rahul, "Two bills aren't showing in GSTR-2B: Bhagyashree Stationers and Sai Logistics. Could you ask them to file? We'll hold that credit for now.", 4300),
    msg("ABC Traders", abcUser, "I'll call them today.", 4200),
    msg("ABC Traders", admin, "Also, the cheque photo you sent is blurred, we can't read the account number. Please retake it in daylight.", 2900),
    msg("ABC Traders", abcUser, "Sorry about that, sent a clear one now.", 1400),
    msg("ABC Traders", rahul, "Perfect, that's readable. GST working is with CA sir for review.", 1300, RUN.abcGst.taskAt(4)),

    // XYZ Pvt Ltd
    msg("XYZ Pvt Ltd", priya, "Meera, could you confirm the TDS deduction for the contractor payment made on 14 September?", 5800),
    msg("XYZ Pvt Ltd", xyzUser, "It was to Sai Logistics, 1,56,000. Section 194C at 2%.", 5600),
    msg("XYZ Pvt Ltd", priya, "Thank you, that matches the register. Q2 return is on track.", 5500),
    msg("XYZ Pvt Ltd", priya, "We also need the September purchase bills to close the GST cycle.", 2100, RUN.xyzGst.taskAt(1)),
    msg("XYZ Pvt Ltd", xyzUser, "Our accountant is on leave till Wednesday. Will send them as soon as he's back.", 1900),
    msg("XYZ Pvt Ltd", priya, "Noted, I've marked the task as waiting on you so it doesn't look overdue.", 1850),

    // Om Services
    msg("Om Services", priya, "Omkar, the September salary register is uploaded. Please check the two new joiners before we process.", 1500),
    msg("Om Services", omUser, "Checked. Aarti's basic should be 14,500, not 14,000, revised from 1 September.", 1200),
    msg("Om Services", priya, "Updated, thank you. I'll redo the PF working and send it back today.", 1100),
    msg("Om Services", priya, "We're still waiting on the September bank statement, whenever you have it.", 600),

    // Raj Enterprises — a closed, friendly thread.
    msg("Raj Enterprises", amit, "Sanjay, the return for AY 2026-27 has been filed and e-verified. Acknowledgement is uploaded.", 5900),
    msg("Raj Enterprises", rajUser, "Thank you Amit. Any tax payable?", 5820),
    msg("Raj Enterprises", amit, "No, advance tax and TDS covered it. Net payable is nil.", 5800),
    msg("Raj Enterprises", rajUser, "Excellent. When is the ROC filing due?", 5700),
    msg("Raj Enterprises", admin, "AOC-4 by 30 October and MGT-7 by 29 November. Both are on our list.", 5600),
  ]),
  "create messages",
);
step("26 messages across 4 conversations");

// ================================================================
// Notifications
//
// Most of these already exist: the database triggers on tasks, document
// requests and messages fired while the rows above were inserted, which is
// worth pointing out in the demo — no application code created them.
//
// Only workflow events have no trigger, so those are added by hand. Then
// every notification is spread back over the last few days and all but the
// newest are marked read, so the bell shows a believable count instead of
// sixty unread items all stamped "just now".
// ================================================================
const note = (user_id, title, message, entity_type, entity_id) => ({
  firm_id: firm.id, user_id, title, message, entity_type, entity_id,
});

must(
  await db.from("notifications").insert([
    note(sneha, "A workflow was generated", "Statutory Audit for Vertex Solutions LLP (FY 2025-26): 7 tasks, assigned to you.", "workflow", RUN.vertexAudit.id),
    note(rahul, "A workflow was generated", "GST Monthly for ABC Traders (September 2026): 7 tasks, assigned to you.", "workflow", RUN.abcGst.id),
    note(priya, "A workflow was generated", "GST Monthly for XYZ Pvt Ltd (September 2026): 7 tasks, assigned to you.", "workflow", RUN.xyzGst.id),
    note(admin, "Workflow closed", "Income Tax Return for Raj Enterprises (AY 2026-27) was closed. All 8 tasks completed.", "workflow", RUN.rajItr.id),
    note(admin, "Workflow cancelled", "GST Monthly (old format) for ABC Traders (August 2026) was cancelled.", "workflow", RUN.abcAug.id),
  ]),
  "create workflow notifications",
);

{
  const all = must(
    await db.from("notifications").select("id").eq("firm_id", firm.id).order("created_at").order("id"),
    "load notifications",
  );
  const ids = all.map((n) => n.id);
  const UNREAD = 7;

  // Everything read, then the newest few put back to unread.
  must(await db.from("notifications").update({ read: true }).eq("firm_id", firm.id), "mark read");
  const recent = ids.slice(-UNREAD);
  if (recent.length) must(await db.from("notifications").update({ read: false }).in("id", recent), "mark unread");

  // Spread the timestamps over the last six days, oldest first.
  const BUCKETS = [8600, 5900, 4300, 2800, 1400, 420, 95];
  const per = Math.ceil(ids.length / BUCKETS.length);
  for (let b = 0; b < BUCKETS.length; b++) {
    const chunk = ids.slice(b * per, (b + 1) * per);
    if (!chunk.length) continue;
    must(
      await db.from("notifications").update({ created_at: minutesAgo(BUCKETS[b]) }).in("id", chunk),
      "backdate notifications",
    );
  }
  step(`${ids.length} notifications (${UNREAD} unread; most came from database triggers)`);
}

// ================================================================
// Saved AI conversations
// ================================================================
async function aiConversation({ user, title, createdDaysAgo, turns }) {
  const [conv] = must(
    await db.from("ai_conversations").insert({
      firm_id: firm.id, user_id: user, title,
      created_at: daysAgo(createdDaysAgo),
      updated_at: daysAgo(createdDaysAgo),
    }).select(),
    `create ai conversation ${title}`,
  );
  const rows = [];
  let offset = 0;
  for (const t of turns) {
    rows.push({
      conversation_id: conv.id, user_id: user, role: "USER", content: t.q, tool: null, meta: {},
      created_at: new Date(Date.now() - createdDaysAgo * DAY + offset * 60000).toISOString(),
    });
    offset += 1;
    rows.push({
      conversation_id: conv.id, user_id: user, role: "ASSISTANT", content: t.a, tool: t.tool ?? "summary",
      meta: {
        rows: t.rows ?? undefined,
        applied: t.applied ?? undefined,
        routedBy: t.routedBy ?? "model",
        promptVersion: 3,
        models: ["llama-3.3-70b-versatile"],
        ms: t.ms ?? 1200,
        usedFallback: !!t.usedFallback,
        degraded: t.degraded ?? undefined,
      },
      created_at: new Date(Date.now() - createdDaysAgo * DAY + offset * 60000).toISOString(),
    });
    offset += 1;
  }
  must(await db.from("ai_messages").insert(rows), `ai messages for ${title}`);
}

// The rows the assistant returns must point at tasks that really exist, or
// clicking one in the demo lands on the wrong page.
const abcReview = RUN.abcGst.taskAt(4);   // Confirm the summary with the client
const abcPayTax = RUN.abcGst.taskAt(5);   // Pay the tax

await aiConversation({
  user: admin, title: "What should I look at first today?", createdDaysAgo: 0,
  turns: [
    {
      q: "What should I look at first today?",
      a: "Two things need you specifically, because nobody else can approve them.\n\n" +
         "First, two tasks are sitting in Under review: the GST summary for ABC Traders (Rahul) and the Q2 TDS return for Om Services (Priya). Both are blocked until you approve or send them back.\n\n" +
         "Second, one document is waiting on a review: the September bank statement for ABC Traders, uploaded two days ago.\n\n" +
         "Everything else is moving. One task is overdue — the GST notice reply for ABC Traders, which was due two days ago and is still To do.",
      tool: "summary", ms: 1840,
    },
    {
      q: "Which one is most urgent?",
      a: "The GST notice reply for ABC Traders. It is the only overdue item, it is marked High priority, and a notice reply has a statutory deadline that the other two do not. The reviews can wait a day; a missed notice cannot.",
      tool: "summary", ms: 980,
    },
  ],
});

await aiConversation({
  user: admin, title: "Show me overdue GST work", createdDaysAgo: 1,
  turns: [
    {
      q: "Show me overdue GST work",
      a: "One GST task is overdue across the firm.",
      tool: "search", applied: ["service: GST", "status: open", "overdue only"],
      rows: [
        { id: noticeTask, title: "Reply to the GST notice for FY 2024-25", client: "ABC Traders", service: "Other", period: "September 2026", due_date: dueIn(-2), status: "TODO", assignee: "Rahul Mehta" },
      ],
      ms: 1420,
    },
  ],
});

await aiConversation({
  user: admin, title: "Which documents am I still waiting for?", createdDaysAgo: 2,
  turns: [
    {
      q: "Which documents am I still waiting for?",
      a: "Three requests are still open with clients.\n\n" +
         "• Om Services — September bank statement, due in 2 days, not uploaded yet.\n" +
         "• Vertex Solutions LLP — management representation letter, due in 3 days, not uploaded yet.\n" +
         "• ABC Traders — cancelled cheque: version 1 was rejected as unreadable, version 2 came in yesterday and is waiting for review.\n\n" +
         "Nothing is overdue on the client side.",
      tool: "documents", ms: 1630,
    },
  ],
});

await aiConversation({
  user: admin, title: "How is work spread across the team?", createdDaysAgo: 4,
  turns: [
    {
      q: "How is work spread across the team?",
      a: "Open tasks by person:\n\n" +
         "• Rahul Mehta — 5 open, 1 overdue, across ABC Traders and XYZ Pvt Ltd.\n" +
         "• Priya Nair — 7 open, none overdue, across XYZ Pvt Ltd and Om Services.\n" +
         "• Amit Shah — 2 open, both ROC filings for Raj Enterprises, due next month.\n" +
         "• Sneha Kulkarni — 5 open, all on the Vertex Solutions audit.\n\n" +
         "Priya has the most open work, but none of it is late. Rahul has the only overdue item.",
      tool: "workload", ms: 2010,
    },
    {
      q: "Say that in two lines",
      a: "Priya carries the largest load (7 open tasks) and is on schedule. Rahul has the firm's only overdue task, the ABC Traders GST notice reply.",
      tool: "summary", ms: 760, routedBy: "rules",
    },
  ],
});

await aiConversation({
  user: rahul, title: "What is due for ABC Traders this week?", createdDaysAgo: 0,
  turns: [
    {
      q: "What is due for ABC Traders this week?",
      a: "Three items for ABC Traders in the next seven days.",
      tool: "search", applied: ["client: ABC Traders", "due within 7 days"],
      rows: [
        { id: noticeTask, title: "Reply to the GST notice for FY 2024-25", client: "ABC Traders", service: "Other", period: "September 2026", due_date: dueIn(-2), status: "TODO", assignee: "Rahul Mehta" },
        { id: abcReview, title: "Confirm the summary with the client", client: "ABC Traders", service: "GST", period: "September 2026", due_date: dueIn(1), status: "UNDER_REVIEW", assignee: "Rahul Mehta" },
        { id: abcPayTax, title: "Pay the tax", client: "ABC Traders", service: "GST", period: "September 2026", due_date: dueIn(2), status: "TODO", assignee: "Rahul Mehta" },
      ],
      ms: 1310,
    },
  ],
});

// One answer produced while the model was unreachable — the fallback story.
await aiConversation({
  user: admin, title: "Overdue work (offline)", createdDaysAgo: 6,
  turns: [
    {
      q: "show me overdue work",
      a: "One task is overdue: Reply to the GST notice for FY 2024-25 (ABC Traders), assigned to Rahul Mehta.\n\n" +
         "Note: the AI service was unreachable, so this answer was produced by the built-in rules instead of the model. The figures come from the same firm records either way.",
      tool: "search", routedBy: "rules", usedFallback: true,
      degraded: "The AI service did not respond in time, so the keyword rules answered instead.",
      rows: [
        { id: noticeTask, title: "Reply to the GST notice for FY 2024-25", client: "ABC Traders", service: "Other", period: "September 2026", due_date: dueIn(-2), status: "TODO", assignee: "Rahul Mehta" },
      ],
      ms: 60,
    },
  ],
});
step("6 saved AI conversations, including one offline fallback");

// ================================================================
// Activity log
// ================================================================
const log = (mins, user_id, client, entity_type, entity_id, action, description) => ({
  firm_id: firm.id, user_id, client_id: C[client], entity_type, entity_id, action, description, created_at: minutesAgo(mins),
});

must(
  await db.from("activity_logs").insert([
    log(44000, admin, "ABC Traders", "client", C["ABC Traders"], "CLIENT_CREATED", "Created client ABC Traders"),
    log(43900, admin, "ABC Traders", "client", C["ABC Traders"], "STAFF_ASSIGNED", "Assigned Rahul Mehta to ABC Traders"),
    log(43800, admin, "XYZ Pvt Ltd", "client", C["XYZ Pvt Ltd"], "CLIENT_CREATED", "Created client XYZ Pvt Ltd"),
    log(43700, admin, "XYZ Pvt Ltd", "client", C["XYZ Pvt Ltd"], "STAFF_ASSIGNED", "Assigned Priya Nair to XYZ Pvt Ltd"),
    log(26000, admin, "Vertex Solutions LLP", "client", C["Vertex Solutions LLP"], "CLIENT_CREATED", "Created client Vertex Solutions LLP"),
    log(25900, admin, "Vertex Solutions LLP", "workflow", RUN.vertexAudit.id, "WORKFLOW_GENERATED", "Generated Statutory Audit for Vertex Solutions LLP (FY 2025-26, 2026-27): 7 task(s), assigned to Sneha Kulkarni"),
    log(17400, admin, "ABC Traders", "workflow", RUN.abcGst.id, "WORKFLOW_GENERATED", "Generated GST Monthly for ABC Traders (September 2026, 2026-27): 7 task(s), assigned to Rahul Mehta"),
    log(13000, abcUser, "ABC Traders", "document_request", RUN.abcGst.id, "DOCUMENT_UPLOADED", "Rajesh Gupta uploaded sales-invoices-sep-2026.pdf for \"September sales invoices\""),
    log(12900, rahul, "ABC Traders", "document_request", RUN.abcGst.id, "DOCUMENT_ACCEPTED", "Rahul Mehta accepted version 1 of \"September sales invoices\""),
    log(8600, admin, "XYZ Pvt Ltd", "workflow", RUN.xyzGst.id, "WORKFLOW_GENERATED", "Generated GST Monthly for XYZ Pvt Ltd (September 2026, 2026-27): 7 task(s), assigned to Priya Nair"),
    log(5800, amit, "Raj Enterprises", "task", RUN.rajItr.taskAt(7), "TASK_STATUS_CHANGED", "Changed \"File the return\" from Under review to Completed"),
    log(5400, admin, "Raj Enterprises", "workflow", RUN.rajItr.id, "WORKFLOW_CLOSED", "Closed Income Tax Return for Raj Enterprises (AY 2026-27)"),
    log(4100, admin, "ABC Traders", "document_request", RUN.abcGst.id, "DOCUMENT_REJECTED", "CA Anil Sharma rejected version 1 of \"Cancelled cheque for the refund account\": the image is out of focus"),
    log(3000, admin, "ABC Traders", "workflow", RUN.abcAug.id, "WORKFLOW_CANCELLED", "Cancelled GST Monthly (old format) for ABC Traders (August 2026): superseded by the new template"),
    log(1440, abcUser, "ABC Traders", "document_request", RUN.abcGst.id, "DOCUMENT_UPLOADED", "Rajesh Gupta uploaded cancelled-cheque.png as version 2 of \"Cancelled cheque for the refund account\""),
    log(420, priya, "Om Services", "task", RUN.omTds.taskAt(5), "TASK_STATUS_CHANGED", "Changed \"Prepare and validate the quarterly return\" from In progress to Under review"),
    log(300, priya, "XYZ Pvt Ltd", "task", RUN.xyzGst.taskAt(1), "TASK_STATUS_CHANGED", "Changed \"Collect sales and purchase invoices\" from In progress to Waiting for client"),
    log(160, abcUser, "ABC Traders", "document_request", RUN.abcGst.id, "DOCUMENT_UPLOADED", "Rajesh Gupta uploaded bank-statement-sep-2026.pdf for \"September bank statement\""),
    log(90, rahul, "ABC Traders", "task", abcReview, "TASK_STATUS_CHANGED", "Changed \"Confirm the summary with the client\" from In progress to Under review"),
  ]),
  "create activity",
);
step("19 activity entries");

console.log(`
Demo data is ready. Every screen has something on it.

  6 templates (1 archived)     8 workflow runs        59 tasks
  14 document requests         12 files in storage    26 messages
  16 notifications             6 AI conversations     19 activity entries

All accounts use the DEMO_PASSWORD from .env.local.

  CA / Admin        anil@sharma-associates.test
  Staff             rahul@sharma-associates.test    (has the overdue task)
  Staff             priya@sharma-associates.test    (busiest)
  Staff             amit@sharma-associates.test
  Staff             sneha@sharma-associates.test    (the audit)
  Client            rajesh@abctraders.test          -> must change password
  Client            meera@xyzpvt.test
  Client            om@omservices.test
  Client            accounts@rajent.test
  Other firm admin  neha@kapoor-co.test             -> for the isolation test

A suggested order to demonstrate in is in docs/DEMO-SCRIPT.md.
`);
