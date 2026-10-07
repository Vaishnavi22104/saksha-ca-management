"use server";

import { revalidatePath } from "next/cache";
import { friendlyError, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, messageSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

export async function sendMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser(["ADMIN", "STAFF", "CLIENT"]);
  const parsed = messageSchema.safeParse({
    client_id: formData.get("client_id"),
    message: formData.get("message"),
    task_id: formData.get("task_id"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;

  const supabase = await createClient();
  // The database checks the sender's relationship to this client again.
  const { error } = await supabase.rpc("send_message", {
    p_client_id: d.client_id,
    p_message: d.message,
    p_task_id: d.task_id,
  });
  if (error) return { error: friendlyError(error, "The message could not be sent.") };

  revalidatePath("/messages");
  revalidatePath(`/messages/${d.client_id}`);
  return { ok: true };
}
