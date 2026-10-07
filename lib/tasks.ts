import type { AppUser, Priority, Task, TaskStatus } from "@/lib/types";

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: "" | "green" | "amber" | "blue" }> = {
  TODO: { label: "To do", tone: "" },
  IN_PROGRESS: { label: "In progress", tone: "blue" },
  WAITING_FOR_CLIENT: { label: "Waiting for client", tone: "amber" },
  UNDER_REVIEW: { label: "Under review", tone: "blue" },
  COMPLETED: { label: "Completed", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "" },
};

export const PRIORITY_LABEL: Record<Priority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

/** Mirrors change_task_status() in the database. The database is the authority. */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_CLIENT", "UNDER_REVIEW", "COMPLETED", "CANCELLED"],
  WAITING_FOR_CLIENT: ["IN_PROGRESS", "CANCELLED"],
  UNDER_REVIEW: ["COMPLETED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const ACTION_LABEL: Record<string, string> = {
  "TODO>IN_PROGRESS": "Start work",
  "IN_PROGRESS>WAITING_FOR_CLIENT": "Mark waiting for client",
  "IN_PROGRESS>UNDER_REVIEW": "Submit for review",
  "IN_PROGRESS>COMPLETED": "Mark completed",
  "WAITING_FOR_CLIENT>IN_PROGRESS": "Resume work",
  "UNDER_REVIEW>COMPLETED": "Approve and complete",
  "UNDER_REVIEW>IN_PROGRESS": "Return for changes",
};

/** Which buttons to show. Only decides UI; the database re-checks everything. */
export function allowedNext(user: AppUser, task: Task): TaskStatus[] {
  const admin = user.role === "ADMIN";
  if (!admin && !(user.role === "STAFF" && task.assigned_to === user.id)) return [];
  return TRANSITIONS[task.status].filter((to) => {
    if (to === "CANCELLED") return admin;
    if (task.status === "UNDER_REVIEW") return admin;
    if (task.status === "IN_PROGRESS" && to === "COMPLETED") return admin || !task.requires_review;
    if (task.status === "IN_PROGRESS" && to === "UNDER_REVIEW") return admin || task.requires_review;
    return true;
  });
}

export const isOpen = (t: Pick<Task, "status">) => t.status !== "COMPLETED" && t.status !== "CANCELLED";

/** Overdue is derived on the server, never stored. */
export const isOverdue = (t: Pick<Task, "status" | "due_date">, now = new Date()) =>
  isOpen(t) && new Date(t.due_date) < now;

export const TASK_SELECT =
  "*, client:clients(name), service:services(name), assignee:users!tasks_assigned_to_fkey(name)";
