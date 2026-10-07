"use server";

import { revalidatePath } from "next/cache";
import { friendlyError, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function markAllReadAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  await requireUser();
  const supabase = await createClient();
  // The function only ever touches the caller's own rows.
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) return { error: friendlyError(error, "Your notifications could not be updated.") };

  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  return { ok: true };
}
