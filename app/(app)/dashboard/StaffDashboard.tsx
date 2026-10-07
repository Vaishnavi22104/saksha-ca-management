import Link from "next/link";
import { EmptyState, Panel } from "@/components/ui";
import { TaskTable } from "@/components/TaskTable";
import { BarRows, Gauge, type Slice } from "@/components/charts";
import { createClient } from "@/lib/supabase/server";
import { formatDate, greeting, plural } from "@/lib/format";
import { TASK_SELECT, isOpen, isOverdue } from "@/lib/tasks";
import { REQUEST_STATUS } from "@/lib/documents";
import type { AppUser, DocumentRequestRow, TaskRow } from "@/lib/types";

const ICON = {
  task: "M9 11l3 3 5-6M4 6h4M4 12h3M4 18h6",
  clock: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18ZM12 7v5l3 2",
  people: "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7",
  check: "M20 6 9 17l-5-5",
};

function Chip({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export async function StaffDashboard({ user }: { user: AppUser }) {
  const supabase = await createClient();
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 864e5);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [{ data }, { count: clientCount }, { data: requestData }] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).eq("assigned_to", user.id),
    supabase.from("client_staff").select("client_id", { count: "exact", head: true }).eq("staff_id", user.id),
    // RLS limits this to the clients this staff member is assigned to.
    supabase
      .from("document_requests")
      .select("*, client:clients(name), task:tasks!document_requests_task_id_fkey(id, title)")
      .in("status", ["REQUESTED", "UPLOADED", "UNDER_REVIEW", "REJECTED"])
      .order("due_date", { nullsFirst: false })
      .limit(8),
  ]);

  const requests = (requestData ?? []) as unknown as DocumentRequestRow[];
  const mine = (data ?? []) as unknown as TaskRow[];
  const open = mine.filter(isOpen);
  const overdue = open.filter((t) => isOverdue(t, now));
  const sameDay = (a: string | null, b: Date) =>
    !!a && new Date(a).toDateString() === b.toDateString();

  const m = {
    open: open.length,
    today: open.filter((t) => sameDay(t.due_date, now) && !isOverdue(t, now)).length,
    overdue: overdue.length,
    waiting: open.filter((t) => t.status === "WAITING_FOR_CLIENT").length,
  };

  // What is due on each of the next seven days — the week at a glance.
  const week: Slice[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(now.getTime() + i * 864e5);
    week.push({
      key: day.toISOString().slice(0, 10),
      label: i === 0 ? "Today" : day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }),
      value: open.filter((t) => sameDay(t.due_date, day)).length,
      colour: i === 0 ? "--violet-500" : "--lime-500",
    });
  }

  // This month's progress, so there is a sense of movement.
  const monthTasks = mine.filter((t) => new Date(t.due_date) >= monthStart);
  const monthDone = monthTasks.filter((t) => t.status === "COMPLETED").length;

  // The single most urgent thing, shown as a "do this next" card.
  const next = [...open]
    .filter((t) => t.status !== "WAITING_FOR_CLIENT")
    .sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date))[0];

  const sections = [
    { title: "Overdue", tasks: overdue, empty: "Nothing overdue." },
    {
      title: "Due this week",
      tasks: open.filter((t) => !isOverdue(t, now) && t.status !== "WAITING_FOR_CLIENT" && new Date(t.due_date) <= weekEnd),
      empty: "Nothing else due in the next 7 days.",
    },
    {
      title: "Waiting for client",
      tasks: open.filter((t) => t.status === "WAITING_FOR_CLIENT" && !isOverdue(t, now)),
      empty: "No tasks are blocked on clients.",
    },
    {
      title: "Recently completed",
      tasks: mine.filter((t) => t.status === "COMPLETED").slice(0, 5),
      empty: "Completed tasks will show here.",
    },
  ];

  return (
    <>
      <div className="page-toolbar">
        <p className="greeting" style={{ margin: 0 }}>{greeting(now)}, {user.name.split(" ")[0]}</p>
        <div className="pt-actions">
          <Link className="pt-btn" href="/tasks?overdue=1">Overdue first</Link>
          <Link className="pt-btn" href="/tasks">My tasks</Link>
        </div>
      </div>

      <div className="dash-grid">
        <section className="hero-card">
          <div className="hero-card-h">
            <h2>Your work today</h2>
            <p>Only your own tasks — {plural(clientCount ?? 0, "client is", "clients are")} assigned to you.</p>
          </div>
          <div className="ledger">
            <Link href="/tasks?status=OPEN"><span className="k"><Chip d={ICON.task} />Open</span><span className="n">{m.open}</span><span className="l">My open tasks</span></Link>
            <Link href="/tasks"><span className="k"><Chip d={ICON.clock} />Today</span><span className="n">{m.today}</span><span className="l">Due today</span></Link>
            <Link href="/tasks?overdue=1" className={m.overdue ? "alert" : undefined}><span className="k"><Chip d={ICON.clock} />Late</span><span className="n">{m.overdue}</span><span className="l">Overdue</span></Link>
            <Link href="/tasks?status=WAITING_FOR_CLIENT"><span className="k"><Chip d={ICON.people} />Clients</span><span className="n">{m.waiting}</span><span className="l">Waiting on client</span></Link>
          </div>
        </section>

        {/* The one thing to pick up next, with a way straight into it. */}
        <aside className="next-card">
          <span className="next-tag">Next up</span>
          {next ? (
            <>
              <h3>{next.title}</h3>
              <p className="next-sub">
                {next.client?.name} · {next.service?.name}
                {next.period ? `, ${next.period}` : ""}
              </p>
              <p className={`next-due ${isOverdue(next, now) ? "late" : ""}`}>
                {isOverdue(next, now) ? "Overdue since " : "Due "}{formatDate(next.due_date)}
              </p>
              <Link href={`/tasks/${next.id}`} className="btn primary block">Open this task</Link>
            </>
          ) : (
            <>
              <h3>Nothing waiting on you</h3>
              <p className="next-sub">Every task assigned to you is either finished or waiting on a client.</p>
              <Link href="/tasks" className="btn block">See all my tasks</Link>
            </>
          )}
        </aside>

        <div className="dash-pair">
          <Panel title="Due over the next 7 days" padded>
            <BarRows rows={week} hint="Tasks due on each of the next seven days" />
          </Panel>
          <Panel title="This month" padded>
            <Gauge done={monthDone} total={monthTasks.length} caption="Your tasks this month" />
          </Panel>
        </div>
      </div>

      <Panel title="Documents from your clients" action={<Link className="small" href="/documents">All documents</Link>}>
        {requests.length ? (
          <ul className="list">
            {requests.map((r) => {
              const st = REQUEST_STATUS[r.status];
              return (
                <li key={r.id}>
                  <span>
                    <Link className="rowlink" href={`/documents/${r.id}`}>{r.title}</Link>
                    <span className="sub">
                      {r.client?.name}
                      {r.due_date ? ` · by ${formatDate(r.due_date)}` : ""}
                    </span>
                  </span>
                  <span className={`badge ${st.tone ? "b-" + st.tone : ""}`}>{st.label}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="Nothing outstanding">Documents your clients still owe will appear here.</EmptyState>
        )}
      </Panel>

      <div className="stack">
        {sections.map((s) => (
          <Panel key={s.title} title={s.title} action={<span className="muted small">{s.tasks.length}</span>}>
            <TaskTable tasks={s.tasks} showAssignee={false} emptyTitle={s.empty} emptyText="" />
          </Panel>
        ))}
      </div>
    </>
  );
}
