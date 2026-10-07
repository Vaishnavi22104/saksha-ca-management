"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError, requireUser } from "@/lib/auth";
import { provisionAccount } from "@/lib/accounts";
import { createClient } from "@/lib/supabase/server";
import { clientSchema, fieldErrors } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

function readClientForm(formData: FormData) {
  return clientSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    pan: formData.get("pan"),
    gstin: formData.get("gstin"),
    business_type: formData.get("business_type"),
  });
}

export async function createClientAction(_prev: ActionState, formData: FormData): Promise<ActionState & { clientId?: string }> {
  const user = await requireUser(["ADMIN"]);
  const parsed = readClientForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: clientId, error } = await supabase.rpc("create_client", {
    p_name: d.name, p_email: d.email, p_phone: d.phone ?? "", p_pan: d.pan ?? "",
    p_gstin: d.gstin ?? "", p_business_type: d.business_type,
  });
  if (error || !clientId) {
    const msg = friendlyError(error, "The client could not be created.");
    return /email/i.test(msg) ? { fieldErrors: { email: msg } } : { error: msg };
  }
  revalidatePath("/clients");
  revalidatePath("/dashboard");

  if (formData.get("create_login") !== "on") {
    redirect(`/clients/${clientId}`);
  }

  const account = await provisionAccount({ actor: user, name: d.name, email: d.email, role: "CLIENT", clientId });
  if (!account.ok) {
    // Honest partial-failure message (plan section 120).
    return { clientId, error: `Client created, but the login account was not: ${account.error}` };
  }
  return { ok: true, clientId, credentials: { name: d.name, email: d.email, password: account.password } };
}

export async function updateClientAction(clientId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const parsed = readClientForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_client", {
    p_client_id: clientId, p_name: d.name, p_email: d.email, p_phone: d.phone ?? "",
    p_pan: d.pan ?? "", p_gstin: d.gstin ?? "", p_business_type: d.business_type,
  });
  if (error) {
    const msg = friendlyError(error, "Changes could not be saved.");
    return /email/i.test(msg) ? { fieldErrors: { email: msg } } : { error: msg };
  }
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function setClientActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const clientId = String(formData.get("client_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_client_active", {
    p_client_id: clientId,
    p_active: formData.get("active") === "true",
  });
  if (error) return { error: friendlyError(error, "The client status could not be changed.") };
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  return { ok: true };
}

export async function assignStaffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const clientId = String(formData.get("client_id"));
  const staffId = String(formData.get("staff_id") ?? "");
  if (!staffId) return { error: "Choose a staff member." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_staff", { p_client_id: clientId, p_staff_id: staffId });
  if (error) return { error: friendlyError(error, "Staff could not be assigned.") };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

export async function unassignStaffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const clientId = String(formData.get("client_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("unassign_staff", {
    p_client_id: clientId,
    p_staff_id: String(formData.get("staff_id")),
  });
  if (error) return { error: friendlyError(error, "Staff could not be removed.") };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
