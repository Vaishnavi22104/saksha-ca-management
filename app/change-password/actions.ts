"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { fieldErrors, passwordSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_active) redirect("/auth/signout?reason=inactive");

  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    // Supabase rejects reusing the current password with this code.
    if (error.code === "same_password") {
      return { fieldErrors: { password: "Choose a password different from the temporary one." } };
    }
    return { error: error.message || "Could not update your password. Try again." };
  }

  // must_change_password can't be edited by users directly (no RLS update policy),
  // so the server clears it with the service role after the password really changed.
  const admin = createAdminClient();
  const { error: flagError } = await admin
    .from("users")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (flagError) return { error: "Your password changed, but we couldn't finish setup. Try signing in again." };

  const { data: link } = await admin.from("client_users").select("client_id").eq("user_id", user.id).maybeSingle();
  await admin.from("activity_logs").insert({
    firm_id: user.firm_id,
    user_id: user.id,
    client_id: link?.client_id ?? null,
    entity_type: "user",
    entity_id: user.id,
    action: "PASSWORD_CHANGED",
    description: `${user.name} set a new password`,
  });

  redirect("/dashboard");
}
