"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/types";

/** Switches email notifications on or off for the signed-in person only. */
export async function setEmailPrefAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const enabled = formData.get("enabled") === "on";

  // Users have no permission to edit their own row, so the server does it,
  // after requireUser() has proven who is asking, and only for that id.
  const { error } = await createAdminClient()
    .from("users")
    .update({ email_notifications: enabled, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: "Could not save that. Try again." };

  revalidatePath("/profile");
  return { ok: true, message: enabled ? "Email notifications are on." : "Email notifications are off." };
}
