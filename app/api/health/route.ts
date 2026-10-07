import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * For uptime monitors (UptimeRobot, Better Stack, a Vercel check).
 * Reports whether the app is up and whether it can reach the database.
 * Returns no data, only a yes or no, so it is safe to leave public.
 */
export async function GET() {
  let db = false;
  try {
    const { error } = await createAdminClient().from("firms").select("id", { head: true, count: "exact" }).limit(1);
    db = !error;
  } catch {
    db = false;
  }
  return NextResponse.json({ ok: db, db, time: new Date().toISOString() }, { status: db ? 200 : 503 });
}
