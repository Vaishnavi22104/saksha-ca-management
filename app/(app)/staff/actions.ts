"use server";

import { revalidatePath } from "next/cache";
import { friendlyError, requireUser } from "@/lib/auth";
import { provisionAccount } from "@/lib/accounts";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, staffSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

export async function createStaffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["ADMIN"]);
  const parsed = staffSchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const account = await provisionAccount({ actor: user, name: parsed.data.name, email: parsed.data.email, role: "STAFF" });
  if (!account.ok) return { fieldErrors: { email: account.error } };

  revalidatePath("/staff");
  return { ok: true, credentials: { name: parsed.data.name, email: parsed.data.email, password: account.password } };
}

export async function setStaffActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staff_active", {
    p_user_id: String(formData.get("user_id")),
    p_active: formData.get("active") === "true",
  });
  if (error) return { error: friendlyError(error, "The staff status could not be changed.") };
  revalidatePath("/staff");
  return { ok: true };
}
