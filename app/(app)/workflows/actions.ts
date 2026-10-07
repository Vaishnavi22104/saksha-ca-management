"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dueDateFromInput } from "@/lib/format";
import { fieldErrors, generateWorkflowSchema, stepsFromFormData, templateSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

export async function createTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    service_id: formData.get("service_id"),
    description: formData.get("description") ?? undefined,
    steps: stepsFromFormData(formData),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_workflow_template", {
    p_name: parsed.data.name,
    p_service_id: parsed.data.service_id,
    p_description: parsed.data.description ?? null,
    p_steps: parsed.data.steps,
  });
  if (error || !id) return { error: friendlyError(error, "The template could not be created.") };

  revalidatePath("/workflows");
  redirect(`/workflows/${id}`);
}

export async function updateTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const templateId = String(formData.get("template_id") ?? "");
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    service_id: formData.get("service_id"),
    description: formData.get("description") ?? undefined,
    steps: stepsFromFormData(formData),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_workflow_template", {
    p_template_id: templateId,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_steps: parsed.data.steps,
  });
  if (error) return { error: friendlyError(error, "The template could not be saved.") };

  revalidatePath("/workflows");
  revalidatePath(`/workflows/${templateId}`);
  redirect(`/workflows/${templateId}`);
}

export async function setTemplateActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const templateId = String(formData.get("template_id") ?? "");
  const active = String(formData.get("active")) === "true";

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_workflow_template_active", {
    p_template_id: templateId,
    p_active: active,
  });
  if (error) return { error: friendlyError(error, "The template could not be updated.") };

  revalidatePath("/workflows");
  revalidatePath(`/workflows/${templateId}`);
  return { ok: true, message: active ? "Template restored." : "Template archived." };
}

export async function generateWorkflowAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const parsed = generateWorkflowSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: runId, error } = await supabase.rpc("generate_workflow", {
    p_template_id: d.template_id,
    p_client_id: d.client_id,
    p_financial_year: d.financial_year,
    p_period: d.period,
    p_due_date: dueDateFromInput(d.due),
    p_assigned_to: d.assigned_to,
    p_allow_duplicate: d.allow_duplicate,
  });
  // The duplicate warning is one of these messages: it comes from the database.
  if (error || !runId) return { error: friendlyError(error, "The workflow could not be generated.") };

  revalidatePath("/workflows");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  redirect(`/workflows/runs/${runId}`);
}

export async function closeRunAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const runId = String(formData.get("run_id") ?? "");
  const force = String(formData.get("force")) === "true";

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_workflow_run", { p_run_id: runId, p_force: force });
  if (error) return { error: friendlyError(error, "The workflow could not be closed.") };

  revalidatePath("/workflows");
  revalidatePath(`/workflows/runs/${runId}`);
  return { ok: true, message: "Workflow closed." };
}

export async function cancelRunAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const runId = String(formData.get("run_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_workflow_run", { p_run_id: runId });
  if (error) return { error: friendlyError(error, "The workflow could not be cancelled.") };

  revalidatePath("/workflows");
  revalidatePath("/tasks");
  revalidatePath(`/workflows/runs/${runId}`);
  return { ok: true, message: "Workflow cancelled." };
}
