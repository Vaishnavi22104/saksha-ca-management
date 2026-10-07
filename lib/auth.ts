import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, Role } from "@/lib/types";

/** The signed-in user's profile row, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Try with the new profile columns first; fall back to base columns
  // if the migration hasn't been applied yet.
  let { data, error } = await supabase
    .from("users")
    .select("id, firm_id, name, email, role, is_active, must_change_password, phone, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // Columns don't exist yet — query without them.
    const res = await supabase
      .from("users")
      .select("id, firm_id, name, email, role, is_active, must_change_password")
      .eq("id", user.id)
      .maybeSingle();
    data = res.data ? { ...res.data, phone: null, avatar_url: null } : null;
  }

  if (!data) return null;
  return { ...data, phone: data.phone ?? null, avatar_url: data.avatar_url ?? null } as AppUser;
});

/**
 * Use at the top of every protected page and server action.
 * Redirects when signed out, inactive, still on a temporary password,
 * or not in one of the allowed roles.
 */
export async function requireUser(roles?: Role[]): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_active) redirect("/auth/signout?reason=inactive");
  if (user.must_change_password) redirect("/change-password");
  if (roles && !roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}

/** Turns a Postgres/RPC error into a message safe to show users. */
export function friendlyError(error: { code?: string; message?: string } | null, fallback: string): string {
  if (!error) return fallback;
  // P0001 = RAISE EXCEPTION from our own functions; those messages are written for users.
  if (error.code === "P0001" && error.message) return error.message;
  if (error.code === "23505") return "A record with these details already exists.";
  if (error.code === "23514") return "Some details are in the wrong format.";
  console.error(error);
  return fallback;
}
