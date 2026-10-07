"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth";
import { fieldErrors } from "@/lib/validation";
import { z } from "zod";
import type { ActionState } from "@/lib/types";

// --- Schemas ---

const optional = (schema: z.ZodString) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  phone: optional(z.string().trim().regex(/^(\+91)?[6-9]\d{9}$/, "Use a 10-digit mobile number.")),
});

const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    password: z.string().min(8, "Use at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "The two passwords don't match.", path: ["confirm"] });

// --- Actions ---

/** Update the user's name and phone. */
export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  // Use the SECURITY DEFINER RPC to update name + phone.
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_user_profile", {
    p_name: parsed.data.name,
    p_phone: parsed.data.phone ?? null,
  });

  if (error) {
    console.error("update_user_profile RPC error:", error);
    return { error: error.message || "Could not save your profile. Try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/", "layout"); // TopBar shows user name
  return { ok: true, message: "Profile updated." };
}

/** Upload or replace the user's avatar. */
export async function uploadAvatarAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const file = formData.get("avatar") as File | null;

  if (!file || file.size === 0) return { error: "Choose a file first." };
  if (file.size > 2 * 1024 * 1024) return { error: "Image must be under 2 MB." };
  if (!file.type.startsWith("image/")) return { error: "Upload an image file (JPG, PNG, etc.)." };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/avatar.${ext}`;

  const supabase = await createClient();

  // Upload (upsert to replace previous).
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    console.error("Avatar upload error:", uploadError);
    return { error: "Could not upload the image. Try again." };
  }

  // Get the public URL.
  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);

  // Save the URL to the user row (via admin client since users can't UPDATE).
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("users")
    .update({ avatar_url: urlData.publicUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (updateError) {
    console.error("Avatar URL update error:", updateError);
    return { error: "Image uploaded but profile could not be updated. Try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile picture updated." };
}

/**
 * Remove the profile picture: delete the stored file, then clear the URL.
 *
 * The delete runs through the admin client because the storage policies
 * grant upload and replace to each user, not delete — and a picture the
 * person asked to remove should actually leave the bucket rather than
 * linger unreferenced.
 */
export async function removeAvatarAction(_prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  const admin = createAdminClient();

  // Whatever extension it was saved with, it lives in the user's folder.
  const { data: files } = await admin.storage.from("avatars").list(user.id);
  if (files?.length) {
    const paths = files.map((f) => `${user.id}/${f.name}`);
    const { error: removeError } = await admin.storage.from("avatars").remove(paths);
    if (removeError) {
      console.error("Avatar remove error:", removeError);
      return { error: "Could not remove the image. Try again." };
    }
  }

  const { error } = await admin
    .from("users")
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    console.error("Avatar clear error:", error);
    return { error: "Could not update your profile. Try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile picture removed." };
}

/** Change the user's password (requires current password verification). */
export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  // Verify the current password by re-authenticating.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current,
  });
  if (signInError) {
    return { fieldErrors: { current: "Current password is incorrect." } };
  }

  // Update to the new password.
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { fieldErrors: { password: "Choose a different password." } };
    }
    return { error: error.message || "Could not update your password. Try again." };
  }

  // Log the change.
  const admin = createAdminClient();
  await admin.from("activity_logs").insert({
    firm_id: user.firm_id,
    user_id: user.id,
    entity_type: "user",
    entity_id: user.id,
    action: "PASSWORD_CHANGED",
    description: `${user.name} changed their password`,
  });

  revalidatePath("/profile");
  return { ok: true, message: "Password changed successfully." };
}
