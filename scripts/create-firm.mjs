// Creates a real firm and its first CA (admin) login. Run this once per firm,
// from your own computer, against the production project.
//
//   node --env-file=.env.local scripts/create-firm.mjs "Sharma & Associates" "Anil Sharma" anil@sharmaca.in
//
// It prints a temporary password once. The CA is made to choose their own
// password the first time they sign in, and "Forgot password" works as soon
// as Supabase email is set up. Everything else (staff, clients, templates)
// is then done inside the app.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const [firmName, adminName, rawEmail] = process.argv.slice(2);
const email = (rawEmail ?? "").trim().toLowerCase();
if (!firmName?.trim() || !adminName?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: node --env-file=.env.local scripts/create-firm.mjs "Firm name" "Admin name" admin@email.com');
  process.exit(1);
}
if (email.endsWith(".test")) {
  console.error("Use a real email address. Addresses ending in .test are reserved for demo data.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: existing, error: lookupError } = await db.from("firms").select("id").eq("name", firmName.trim());
if (lookupError) {
  console.error("Could not reach the database:", lookupError.message, "\nHave all migrations been run?");
  process.exit(1);
}
if (existing?.length) {
  console.error(`A firm called "${firmName.trim()}" already exists. Nothing was changed.`);
  process.exit(1);
}

const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const password = "Tmp-" + Array.from(randomBytes(12), (b) => chars[b % chars.length]).join("");

const { data: firm, error: firmError } = await db.from("firms").insert({ name: firmName.trim() }).select("id").single();
if (firmError) {
  console.error("Could not create the firm:", firmError.message);
  process.exit(1);
}

const undo = async (userId) => {
  if (userId) {
    await db.from("users").delete().eq("id", userId);
    await db.auth.admin.deleteUser(userId);
  }
  await db.from("firms").delete().eq("id", firm.id);
};

const { data: auth, error: authError } = await db.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { name: adminName.trim() },
});
if (authError || !auth.user) {
  await undo();
  const exists = authError?.code === "email_exists" || /already/i.test(authError?.message ?? "");
  console.error(exists ? "A login with that email already exists." : `Could not create the login: ${authError?.message}`);
  process.exit(1);
}

const { error: profileError } = await db.from("users").insert({
  id: auth.user.id,
  firm_id: firm.id,
  name: adminName.trim(),
  email,
  role: "ADMIN",
  must_change_password: true,
});
if (profileError) {
  await undo(auth.user.id);
  console.error("Could not create the profile:", profileError.message);
  process.exit(1);
}

await db.from("activity_logs").insert({
  firm_id: firm.id,
  user_id: auth.user.id,
  entity_type: "user",
  entity_id: auth.user.id,
  action: "FIRM_CREATED",
  description: `${firmName.trim()} was set up with ${adminName.trim()} as the CA`,
});

console.log(`
Firm created: ${firmName.trim()}

  Sign in at your site with
    Email:              ${email}
    Temporary password: ${password}

Give these to ${adminName.trim()} directly (call or in person). The password is shown only now,
and has to be replaced at first sign-in.
`);
