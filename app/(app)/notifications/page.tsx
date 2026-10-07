import Link from "next/link";
import { redirect } from "next/navigation";
import { Pager } from "@/components/Pager";
import { isOutOfRange, pageHref, parsePage, rangeFor } from "@/lib/pagination";
import { ActionButton } from "@/components/ActionButton";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { ENTITY_LABEL, NOTIFICATION_SELECT } from "@/lib/notifications";
import type { AppNotification } from "@/lib/types";
import { markAllReadAction } from "./actions";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  await requireUser();
  const { view, page: pageParam } = await searchParams;
  const unreadOnly = view !== "all";
  const page = parsePage(pageParam);
  const { from, to } = rangeFor(page);

  const supabase = await createClient();
  // RLS already restricts this to the signed-in user's own notifications.
  let query = supabase.from("notifications").select(NOTIFICATION_SELECT, { count: "exact" }).order("created_at", { ascending: false }).order("id");
  if (unreadOnly) query = query.eq("read", false);

  const { data, count, error } = await query.range(from, to);
  if (isOutOfRange(error)) redirect(pageHref("/notifications", { view }, 1));
  const notifications = (data ?? []) as unknown as AppNotification[];

  return (
    <>
      <PageHeader
        title="Notifications"
        description="What changed while you were away. Opening one marks it as read."
        actions={
          <ActionButton action={markAllReadAction} fields={{}} label="Mark all as read" />
        }
      />

      <Panel
        title={unreadOnly ? "Unread" : "All notifications"}
        action={
          <Link className="linkbtn" href={unreadOnly ? "/notifications?view=all" : "/notifications"}>
            {unreadOnly ? "Show all" : "Show unread only"}
          </Link>
        }
      >
        {notifications.length ? (
          <ul className="list">
            {notifications.map((n) => (
              <li key={n.id}>
                <span>
                  <Link className="rowlink" href={`/notifications/${n.id}`}>{n.title}</Link>
                  <span className="sub">{n.message}</span>
                </span>
                <span className="nowrap">
                  <span className="badge">{ENTITY_LABEL[n.entity_type]}</span>{" "}
                  {!n.read && <span className="badge b-blue">New</span>}{" "}
                  <span className="muted small">{formatDateTime(n.created_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="You're all caught up">
            {unreadOnly ? <Link href="/notifications?view=all">See earlier notifications</Link> : "Nothing here yet."}
          </EmptyState>
        )}
        <Pager path="/notifications" params={{ view }} page={page} total={count ?? notifications.length} />
      </Panel>
    </>
  );
}
