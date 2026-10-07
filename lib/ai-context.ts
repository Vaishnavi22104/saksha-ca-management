import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dayKey, formatDate } from "@/lib/format";
import { isOpen, isOverdue } from "@/lib/tasks";
import { needsClient } from "@/lib/documents";
import type { DocumentRequestRow, TaskRow, WorkflowRunRow } from "@/lib/types";

/**
 * Builds the ONLY text the local model ever sees: workflow metadata for
 * the signed-in user's own firm, read through Row Level Security.
 *
 * Never included: document contents or file names, message text, PAN or
 * GSTIN, anything belonging to another firm. If a fact is not in here,
 * the model has no way to know it.
 */

export interface FirmFacts {
  generatedAt: string;
  lines: string[];
  counts: {
    openTasks: number;
    overdue: number;
    awaitingReview: number;
    waitingOnClients: number;
    documentsToReview: number;
    documentsAwaited: number;
    activeWorkflows: number;
  };
}

export async function collectFirmFacts(): Promise<FirmFacts> {
  const supabase = await createClient();
  const now = new Date();

  const [{ data: taskData }, { data: requestData }, { data: runData }, { data: staffData }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, client:clients!inner(name, status), service:services(name), assignee:users!tasks_assigned_to_fkey(name)")
      .eq("client.status", "ACTIVE"),
    supabase
      .from("document_requests")
      .select("*, client:clients(name), task:tasks!document_requests_task_id_fkey(id, title)")
      .in("status", ["REQUESTED", "UPLOADED", "UNDER_REVIEW", "REJECTED"]),
    supabase.from("workflow_runs").select("*, client:clients(name), service:services(name)").eq("status", "ACTIVE"),
    supabase.from("users").select("id, name").eq("role", "STAFF").eq("is_active", true).order("name"),
  ]);

  const tasks = (taskData ?? []) as unknown as TaskRow[];
  const requests = (requestData ?? []) as unknown as DocumentRequestRow[];
  const runs = (runData ?? []) as unknown as WorkflowRunRow[];
  const staff = (staffData ?? []) as { id: string; name: string }[];

  const open = tasks.filter(isOpen);
  const overdue = open.filter((t) => isOverdue(t, now));
  const review = open.filter((t) => t.status === "UNDER_REVIEW");
  const waiting = open.filter((t) => t.status === "WAITING_FOR_CLIENT");
  const toReview = requests.filter((r) => r.status === "UPLOADED" || r.status === "UNDER_REVIEW");
  const awaited = requests.filter((r) => needsClient(r.status));

  const lines: string[] = [];
  lines.push(`Today: ${formatDate(now)}`);
  lines.push(
    `Totals: ${open.length} open tasks, ${overdue.length} overdue, ${review.length} awaiting CA review, ` +
      `${waiting.length} blocked on clients, ${runs.length} active workflow cycles.`,
  );
  lines.push(
    `Documents: ${toReview.length} uploaded and awaiting the firm's decision, ${awaited.length} still owed by clients.`,
  );

  if (overdue.length) {
    lines.push("Overdue tasks:");
    for (const t of overdue.slice(0, 20)) {
      lines.push(
        `- ${t.client?.name}: "${t.title}" (${t.service?.name}, ${t.period}), was due ${formatDate(t.due_date)}, ` +
          `assigned to ${t.assignee?.name ?? "nobody"}, status ${t.status}.`,
      );
    }
  }

  const dueToday = open.filter((t) => dayKey(t.due_date) === dayKey(now) && !isOverdue(t, now));
  if (dueToday.length) {
    lines.push("Due today:");
    for (const t of dueToday.slice(0, 20)) {
      lines.push(`- ${t.client?.name}: "${t.title}" (${t.period}), assigned to ${t.assignee?.name ?? "nobody"}.`);
    }
  }

  if (review.length) {
    lines.push("Waiting for the CA to approve:");
    for (const t of review.slice(0, 20)) {
      lines.push(`- ${t.client?.name}: "${t.title}" (${t.period}), submitted by ${t.assignee?.name ?? "unknown"}.`);
    }
  }

  if (awaited.length) {
    lines.push("Documents still owed by clients:");
    for (const r of awaited.slice(0, 25)) {
      lines.push(
        `- ${r.client?.name}: "${r.title}"` +
          (r.due_date ? `, asked for by ${formatDate(r.due_date)}` : ", no date set") +
          (r.status === "REJECTED" ? ", the last version was rejected." : "."),
      );
    }
  }

  if (toReview.length) {
    lines.push("Documents uploaded and waiting for the firm's decision:");
    for (const r of toReview.slice(0, 25)) {
      lines.push(`- ${r.client?.name}: "${r.title}".`);
    }
  }

  if (staff.length) {
    lines.push("Staff workload (open tasks each):");
    for (const s of staff) {
      const mine = open.filter((t) => t.assigned_to === s.id);
      lines.push(
        `- ${s.name}: ${mine.length} open, ${mine.filter((t) => isOverdue(t, now)).length} overdue.`,
      );
    }
    const unassigned = open.filter((t) => !t.assigned_to).length;
    if (unassigned) lines.push(`- Unassigned: ${unassigned} open tasks.`);
  }

  if (runs.length) {
    lines.push("Active workflow cycles:");
    for (const r of runs.slice(0, 20)) {
      const runTasks = tasks.filter((t) => t.workflow_run_id === r.id);
      const done = runTasks.filter((t) => t.status === "COMPLETED").length;
      lines.push(`- ${r.client?.name}: ${r.template_name}, ${r.period}, ${done} of ${runTasks.length} tasks done.`);
    }
  }

  return {
    generatedAt: now.toISOString(),
    lines,
    counts: {
      openTasks: open.length,
      overdue: overdue.length,
      awaitingReview: review.length,
      waitingOnClients: waiting.length,
      documentsToReview: toReview.length,
      documentsAwaited: awaited.length,
      activeWorkflows: runs.length,
    },
  };
}

/** The same treatment for one client, used by the reminder drafter. */
export async function collectClientFacts(clientId: string) {
  const supabase = await createClient();
  const now = new Date();

  const [{ data: clientData }, { data: taskData }, { data: requestData }] = await Promise.all([
    supabase.from("clients").select("id, name, status").eq("id", clientId).maybeSingle(),
    supabase.from("tasks").select("*, service:services(name)").eq("client_id", clientId),
    supabase
      .from("document_requests")
      .select("*, client:clients(name), task:tasks!document_requests_task_id_fkey(id, title)")
      .eq("client_id", clientId)
      .in("status", ["REQUESTED", "UPLOADED", "UNDER_REVIEW", "REJECTED"]),
  ]);

  const client = clientData as { id: string; name: string; status: string } | null;
  if (!client) return null;

  const tasks = ((taskData ?? []) as unknown as TaskRow[]).filter(isOpen);
  const requests = (requestData ?? []) as unknown as DocumentRequestRow[];
  const owed = requests.filter((r) => needsClient(r.status));

  const lines: string[] = [`Client: ${client.name}`, `Today: ${formatDate(now)}`];
  if (owed.length) {
    lines.push("Documents this client still owes:");
    for (const r of owed) {
      lines.push(
        `- "${r.title}"` +
          (r.due_date ? `, asked for by ${formatDate(r.due_date)}` : "") +
          (r.status === "REJECTED" ? ` (the last version was returned: ${r.rejection_reason ?? "no reason recorded"})` : "") +
          ".",
      );
    }
  } else {
    lines.push("This client owes no documents right now.");
  }

  const blocked = tasks.filter((t) => t.status === "WAITING_FOR_CLIENT");
  if (blocked.length) {
    lines.push("Work blocked on this client:");
    for (const t of blocked) lines.push(`- "${t.title}" (${t.service?.name}, ${t.period}), due ${formatDate(t.due_date)}.`);
  }

  return { client, owed, blocked, lines };
}
