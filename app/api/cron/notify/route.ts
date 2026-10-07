import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, safeEqual, sendEmail, siteUrl } from "@/lib/email";
import { buildDigest, groupBy, type DigestItem } from "@/lib/email-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Row extends DigestItem {
  user_id: string;
  user: { name: string; email: string; is_active: boolean; email_notifications: boolean } | null;
}

/**
 * Run once a day (see vercel.json), or any time by calling it with
 *   Authorization: Bearer <CRON_SECRET>
 *
 * 1. Creates "due soon" / "overdue" reminders in the database.
 * 2. Emails each person one digest of what they have not yet been emailed.
 *
 * Without RESEND_API_KEY the reminders are still created; nothing is sent
 * and nothing is marked as sent, so turning email on later delivers them.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set on the server." }, { status: 503 });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: reminders, error: reminderError } = await admin.rpc("send_due_reminders");
  if (reminderError) console.error("send_due_reminders:", reminderError.message);

  if (!emailConfigured()) {
    return NextResponse.json({ reminders: reminders ?? 0, emailed: 0, skipped: "Email is not configured (RESEND_API_KEY, EMAIL_FROM)." });
  }

  // Only the last two days: an outage never turns into a flood of old news.
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const { data, error } = await admin
    .from("notifications")
    .select("id, user_id, title, message, user:users(name, email, is_active, email_notifications)")
    .is("emailed_at", null)
    .gte("created_at", since)
    .order("created_at")
    .limit(500);
  if (error) {
    console.error("notifications query:", error.message);
    return NextResponse.json({ error: "Could not read notifications." }, { status: 500 });
  }

  const byUser = groupBy((data ?? []) as unknown as Row[], (r) => r.user_id);
  const base = siteUrl();
  const started = Date.now();
  let emailed = 0;
  let skipped = 0;
  let failed = 0;

  for (const rows of byUser.values()) {
    if (Date.now() - started > 50_000) break; // leave the rest for the next run
    const person = rows[0].user;
    const ids = rows.map((r) => r.id);

    // Switched off, deactivated, a demo address or gone: mark as handled so it is not retried forever.
    if (!person || !person.is_active || !person.email_notifications || person.email.endsWith(".test")) {
      await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", ids);
      skipped += 1;
      continue;
    }

    try {
      const mail = buildDigest(person.name, rows, base);
      await sendEmail(person.email, mail.subject, mail.html, mail.text);
      await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", ids);
      emailed += 1;
    } catch (e) {
      failed += 1;
      console.error("email failed:", e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, 600)); // stay under the provider's rate limit
  }

  return NextResponse.json({ reminders: reminders ?? 0, emailed, skipped, failed });
}
