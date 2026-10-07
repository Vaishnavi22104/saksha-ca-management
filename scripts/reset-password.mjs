// Puts a demo account's password back to DEMO_PASSWORD.
//
//   node --env-file=.env.local scripts/reset-password.mjs rajesh@abctraders.test
//   node --env-file=.env.local scripts/reset-password.mjs rajesh@abctraders.test --first-login
//   node --env-file=.env.local scripts/reset-password.mjs --all
//
// --first-login also sets must_change_password, so the account is back to the
// state a brand-new client is in: it will be asked to choose a password on
// the next sign-in, and until it does, the database shows it nothing at all.
//
// Development only. It refuses to touch anything but .test accounts, so it
// cannot be pointed at a real user by accident.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const demoPassword = process.env.DEMO_PASSWORD;

if (!url || !serviceKey || !demoPassword) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD in .env.local first.");
  process.exit(1);
}

const args = process.argv.slice(2);
const firstLogin = args.includes("--first-login");
const all = args.includes("--all");
const email = args.find((a) => !a.startsWith("--"));

if (!email && !all) {
  console.error("Usage: node --env-file=.env.local scripts/reset-password.mjs <email> [--first-login]");
  console.error("   or: node --env-file=.env.local scripts/reset-password.mjs --all");
  process.exit(1);
}
if (email && !email.endsWith(".test")) {
  console.error("This script only touches demo accounts (emails ending in .test).");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// The admin API works by user id, so the account has to be found first.
const { data: list, error: listError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) {
  console.error("Could not list users:", listError.message);
  process.exit(1);
}

const targets = list.users.filter((u) =>
  u.email?.endsWith(".test") && (all || u.email === email));

if (!targets.length) {
  console.error(email ? `No demo account found for ${email}.` : "No demo accounts found.");
  process.exit(1);
}

for (const user of targets) {
  const { error } = await db.auth.admin.updateUserById(user.id, { password: demoPassword });
  if (error) {
    console.error(`  ${user.email}: ${error.message}`);
    continue;
  }
  // The profile flag lives in public.users, separately from the auth record.
  const { error: profileError } = await db
    .from("users")
    .update({ must_change_password: firstLogin })
    .eq("id", user.id);
  if (profileError) console.error(`  ${user.email}: profile not updated — ${profileError.message}`);
  else console.log(`  ${user.email} -> DEMO_PASSWORD${firstLogin ? "  (will be asked to change it)" : ""}`);
}

console.log("\nDone.");
