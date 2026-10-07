import Link from "next/link";
import { Panel } from "@/components/ui";
import { ACTIVITY_SELECT, Timeline } from "@/components/Timeline";
import { createClient } from "@/lib/supabase/server";
import { dayKey, greeting, plural } from "@/lib/format";
import { isOpen, isOverdue } from "@/lib/tasks";
import type { Activity, AppUser, TaskRow } from "@/lib/types";
import { WorkList, groupWork } from "./work-groups";

export async function AdminDashboard({ user }: { user: AppUser }) {
  const supabase = await createClient();
  const now = new Date();

  const [{ data: taskData }, { data: staffData }, { data: activityData }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, client:clients!inner(name, status), service:services(name), assignee:users!tasks_assigned_to_fkey(name)")
      .eq("client.status", "ACTIVE"),
    supabase.from("users").select("id, name").eq("role", "STAFF").eq("is_active", true).order("name"),
    supabase.from("activity_logs").select(ACTIVITY_SELECT).order("created_at", { ascending: false }).limit(6),
  ]);

  const tasks = (taskData ?? []) as unknown as TaskRow[];
  const open = tasks.filter(isOpen);
  const m = {
    active: open.length,
    overdue: open.filter((t) => isOverdue(t, now)).length,
    waiting: open.filter((t) => t.status === "WAITING_FOR_CLIENT").length,
    review: open.filter((t) => t.status === "UNDER_REVIEW").length,
    today: open.filter((t) => dayKey(t.due_date) === dayKey(now) && !isOverdue(t, now)).length,
  };

  const staffList = (staffData ?? []) as { id: string; name: string }[];
  const workload = staffList.map((s) => ({ ...s, n: open.filter((t) => t.assigned_to === s.id).length }))
    .sort((a, b) => b.n - a.n);
  const maxLoad = Math.max(1, ...workload.map((w) => w.n));
  const unassigned = open.filter((t) => !t.assigned_to).length;

  const parts: React.ReactNode[] = [];
  if (m.overdue) parts.push(<strong key="o">{plural(m.overdue, "task is", "tasks are")} overdue</strong>);
  if (m.review) parts.push(<span key="r"><strong>{m.review}</strong> waiting for your review</span>);
  if (m.today) parts.push(<span key="t"><strong>{m.today}</strong> due later today</span>);

  const firstName = user.name.replace(/^CA\s+/i, "").split(" ")[0];

  return (
    <>
      <p className="greeting">{greeting(now)}, {firstName}</p>
      <p className="summary">
        {parts.length
          ? parts.map((p, i) => (
              <span key={i}>
                {i > 0 && (i === parts.length - 1 ? " and " : ", ")}
                {p}
              </span>
            ))
          : "Nothing needs your attention right now"}
        .
      </p>

      <div className="ledger">
        <Link href="/tasks?status=OPEN"><span className="n">{m.active}</span><span className="l">Active tasks</span></Link>
        <Link href="/tasks?overdue=1" className={m.overdue ? "alert" : undefined}><span className="n">{m.overdue}</span><span className="l">Overdue</span></Link>
        <Link href="/tasks?status=WAITING_FOR_CLIENT"><span className="n">{m.waiting}</span><span className="l">Waiting for client</span></Link>
        <Link href="/tasks?status=UNDER_REVIEW"><span className="n">{m.review}</span><span className="l">Waiting for review</span></Link>
      </div>

      <div className="grid2">
        <Panel title="Client work" action={<Link className="small" href="/clients">All clients</Link>}>
          <WorkList groups={groupWork(tasks, now)} linkClients />
        </Panel>
        <div className="stack">
          <Panel title="Team workload" action={<Link className="small" href="/staff">Manage staff</Link>}>
            <ul className="list">
              {workload.map((w) => (
                <li key={w.id}>
                  <span>{w.name}</span>
                  <span className="actions">
                    <span className="bar"><i style={{ width: `${(w.n / maxLoad) * 100}%` }} /></span>
                    <span className="small right" style={{ width: 64 }}>{plural(w.n, "task", "tasks")}</span>
                  </span>
                </li>
              ))}
              {unassigned > 0 && (
                <li>
                  <span className="muted">Unassigned</span>
                  <span className="badge b-amber">{plural(unassigned, "task", "tasks")}</span>
                </li>
              )}
            </ul>
          </Panel>
          <Panel title="Recent activity" action={<Link className="small" href="/activity">View all</Link>}>
            <Timeline entries={(activityData ?? []) as unknown as Activity[]} viewerRole="ADMIN" />
          </Panel>
          <Panel padded>
            <span className="strong">AI work summary</span>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              Arrives 30 Sep. Until then, the figures above come straight from the task records.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
