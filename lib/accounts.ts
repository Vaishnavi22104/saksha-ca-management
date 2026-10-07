import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTempPassword } from "@/lib/validation";
import type { AppUser, Role } from "@/lib/types";

type Result = { ok: true; password: string } | { ok: false; error: string };

/**
 * Creates a login (auth user + users row [+ client link]) with a temporary password.
 * Callers MUST have checked that `actor` is an active admin first.
 * If any step fails, earlier steps are undone so no half-created account remains.
 */
export async function provisionAccount(opts: {
  actor: AppUser;
  name: string;
  email: string;
  role: Exclude<Role, "ADMIN">;
  clientId?: string;
}): Promise<Result> {
  const admin = createAdminClient();
  const password = generateTempPassword();

  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    password,
    email_confirm: true,
    user_metadata: { name: opts.name },
  });
  if (error || !data.user) {
    const exists = error?.code === "email_exists" || /already/i.test(error?.message ?? "");
    return { ok: false, error: exists ? "A login with this email already exists." : "The login account could not be created." };
  }
  const userId = data.user.id;

  const rollback = async () => {
    await admin.from("client_users").delete().eq("user_id", userId);
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  };

  const { error: profileError } = await admin.from("users").insert({
    id: userId,
    firm_id: opts.actor.firm_id,
    name: opts.name,
    email: opts.email,
    role: opts.role,
    must_change_password: true,
  });
  if (profileError) {
    await rollback();
    return { ok: false, error: "The login account could not be created." };
  }

  if (opts.clientId) {
    const { error: linkError } = await admin.from("client_users").insert({ user_id: userId, client_id: opts.clientId });
    if (linkError) {
      await rollback();
      return { ok: false, error: "The login account could not be linked to the client." };
    }
  }

  await admin.from("activity_logs").insert({
    firm_id: opts.actor.firm_id,
    user_id: opts.actor.id,
    client_id: opts.clientId ?? null,
    entity_type: "user",
    entity_id: userId,
    action: opts.role === "CLIENT" ? "CLIENT_LOGIN_CREATED" : "USER_CREATED",
    description: opts.role === "CLIENT" ? `Created portal login for ${opts.name}` : `Added staff member ${opts.name}`,
  });

  return { ok: true, password };
}
