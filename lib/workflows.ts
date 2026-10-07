import type { TaskStatus, WorkflowStatus } from "@/lib/types";

export const WORKFLOW_STATUS: Record<WorkflowStatus, { label: string; tone: "" | "green" | "blue" }> = {
  ACTIVE: { label: "Active", tone: "blue" },
  COMPLETED: { label: "Closed", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "" },
};

export const TEMPLATE_SELECT = "*, service:services(name), steps:workflow_template_steps(*)";
export const RUN_SELECT = "*, client:clients(name), service:services(name)";

/** Groups task statuses by workflow run, for progress counts in lists. */
export function groupTasksByRun(rows: { workflow_run_id: string | null; status: TaskStatus }[]) {
  const out: Record<string, { status: TaskStatus }[]> = {};
  for (const r of rows) {
    if (!r.workflow_run_id) continue;
    (out[r.workflow_run_id] ??= []).push({ status: r.status });
  }
  return out;
}

/** Finished / total, counting cancelled tasks as no longer outstanding. */
export function runProgress(tasks: { status: TaskStatus }[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "COMPLETED").length;
  const open = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED").length;
  return { total, done, open };
}

export const sortSteps = <T extends { position: number }>(steps: T[]) =>
  [...steps].sort((a, b) => a.position - b.position);
