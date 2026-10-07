import Link from "next/link";
import { EmptyState, Panel } from "@/components/ui";
import { ACTIVITY_SELECT, Timeline } from "@/components/Timeline";
import { createClient } from "@/lib/supabase/server";
import { formatDate, plural } from "@/lib/format";
import type { Activity, AppUser, TaskRow } from "@/lib/types";
import { WorkList, groupWork } from "./work-groups";

export async function ClientDashboard({ user }: { user: AppUser }) {
  const supabase = await createClient();
  // RLS limits both queries to this client's own records.
  const [{ data: link }, { data: taskData }, { data: activityData }] = await Promise.all([
    supabase.from("client_users").select("client:clients(name)").eq("user_id", user.id).maybeSingle(),
    supabase.from("tasks").select("*, service:services(name)"),
    supabase.from("activity_logs").select(ACTIVITY_SELECT).order("created_at", { ascending: false }).limit(6),
  ]);
  const client = link?.client as unknown as { name: string } | null;
  const tasks = (taskData ?? []) as unknown as TaskRow[];
  const waiting = tasks.filter((t) => t.status === "WAITING_FOR_CLIENT");

  return (
    <>
      <p className="greeting">Welcome, {client?.name}</p>
      <p className="summary">
        {waiting.length ? (
          <>Your CA is waiting on you for <strong>{plural(waiting.length, "item", "items")}</strong>.</>
        ) : (
          "Your CA has everything they need from you right now."
        )}
      </p>
      <div className="grid2">
        <div className="stack">
          <Panel title="Needed from you">
            {waiting.length ? (
              <>
                <ul className="list">
                  {waiting.map((t) => (
                    <li key={t.id}>
                      <span>
                        {t.title}
                        <span className="sub">{t.service?.name}, {t.period} · due {formatDate(t.due_date)}</span>
                      </span>
                      <span className="badge b-amber">Waiting for you</span>
                    </li>
                  ))}
                </ul>
                <div className="panel-b small muted" style={{ borderTop: "1px solid var(--line)" }}>
                  Document upload opens in the next build. For now, share files with your CA as usual.
                </div>
              </>
            ) : (
              <EmptyState title="You're all caught up">Requests from your CA will appear here.</EmptyState>
            )}
          </Panel>
          <Panel title="Work status" action={<Link className="small" href="/work">See all work</Link>}>
            <WorkList groups={groupWork(tasks)} linkClients={false} />
          </Panel>
        </div>
        <Panel title="Recent updates">
          <Timeline entries={(activityData ?? []) as unknown as Activity[]} viewerRole="CLIENT" />
        </Panel>
      </div>
    </>
  );
}
