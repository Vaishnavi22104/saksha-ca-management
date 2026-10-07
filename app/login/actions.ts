"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  // Same message for unknown email and wrong password, so accounts can't be probed.
  if (error || !data.user) return { error: "Email or password is incorrect." };

  const { data: profile } = await supabase
    .from("users")
    .select("is_active, must_change_password")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: "This account is inactive. Contact your CA firm." };
  }

  redirect(profile.must_change_password ? "/change-password" : "/dashboard");
}
