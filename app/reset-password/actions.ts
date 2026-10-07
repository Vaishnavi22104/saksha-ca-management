"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors, passwordSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/types";

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // No session means the emailed link was never opened, or has expired.
  if (!user) redirect("/forgot-password?error=expired");

  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { fieldErrors: { password: "Choose a password different from your current one." } };
    }
    return { error: error.message || "Could not update your password. Try again." };
  }

  // They have just chosen their own password, so a temporary-password
  // account no longer needs the first-sign-in step. Written by the server
  // because users have no permission to edit that flag themselves.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select("firm_id, name")
    .maybeSingle();

  if (profile) {
    const { data: link } = await admin.from("client_users").select("client_id").eq("user_id", user.id).maybeSingle();
    await admin.from("activity_logs").insert({
      firm_id: profile.firm_id,
      user_id: user.id,
      client_id: link?.client_id ?? null,
      entity_type: "user",
      entity_id: user.id,
      action: "PASSWORD_RESET",
      description: `${profile.name} reset their password by email`,
    });
  }

  // End the recovery session and make them sign in with the new password.
  await supabase.auth.signOut();
  redirect("/login?reason=reset");
}
