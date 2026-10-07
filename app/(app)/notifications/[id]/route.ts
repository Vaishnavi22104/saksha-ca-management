import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notificationHref } from "@/lib/notifications";
import type { NotificationEntity } from "@/lib/types";

/**
 * Opening a notification marks it read and forwards to the record it is
 * about. RLS means a notification belonging to someone else is simply
 * not found, and the redirect target has its own access check anyway.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !user.is_active || user.must_change_password) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data: notification } = await supabase
    .from("notifications")
    .select("entity_type, entity_id")
    .eq("id", id)
    .maybeSingle();

  if (!notification) return NextResponse.redirect(new URL("/notifications", request.url));

  await supabase.rpc("mark_notification_read", { p_id: id });

  const href = notificationHref(
    notification.entity_type as NotificationEntity,
    notification.entity_id as string,
    user.role,
  );
  return NextResponse.redirect(new URL(href, request.url));
}
