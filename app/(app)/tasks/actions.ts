"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dueDateFromInput } from "@/lib/format";
import { fieldErrors, taskSchema } from "@/lib/validation";
import type { ActionState, TaskStatus } from "@/lib/types";

const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "WAITING_FOR_CLIENT", "UNDER_REVIEW", "COMPLETED", "CANCELLED"];

export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: taskId, error } = await supabase.rpc("create_task", {
    p_client_id: d.client_id,
    p_service_id: d.service_id,
    p_title: d.title,
    p_financial_year: d.financial_year,
    p_period: d.period,
    p_due_date: dueDateFromInput(d.due),
    p_priority: d.priority,
    p_assigned_to: d.assigned_to,
    p_requires_review: d.requires_review,
    p_description: d.description ?? null,
  });
  if (error || !taskId) return { error: friendlyError(error, "The task could not be created.") };

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  redirect(`/tasks/${taskId}`);
}

export async function changeStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN", "STAFF"]);
  const taskId = String(formData.get("task_id"));
  const status = String(formData.get("status")) as TaskStatus;
  if (!STATUSES.includes(status)) return { error: "Unknown status." };

  const supabase = await createClient();
  // The database validates the transition and the caller's permission.
  const { error } = await supabase.rpc("change_task_status", { p_task_id: taskId, p_status: status });
  if (error) return { error: friendlyError(error, "The task could not be updated.") };

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function reassignTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const taskId = String(formData.get("task_id"));
  const to = String(formData.get("assigned_to") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reassign_task", { p_task_id: taskId, p_assigned_to: to || null });
  if (error) return { error: friendlyError(error, "The task could not be reassigned.") };
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true, message: "Assignment saved." };
}
