import Link from "next/link";
import { EmptyState, Panel } from "@/components/ui";
import { BarRows, Donut, TrendArea, type Point, type Slice } from "@/components/charts";
import { ACTIVITY_SELECT, Timeline } from "@/components/Timeline";
import { createClient } from "@/lib/supabase/server";
import { dayKey, formatDate, formatDateTime, greeting, plural } from "@/lib/format";
import { isOpen, isOverdue } from "@/lib/tasks";
import { REQUEST_STATUS, needsClient } from "@/lib/documents";
import { isFromFirm } from "@/lib/messages";
import { runProgress } from "@/lib/workflows";
import type { Activity, AppUser, DocumentRequestRow, Message, TaskRow, TaskStatus, WorkflowRunRow } from "@/lib/types";
import { DashAssistant } from "./DashAssistant";
import { WorkList, groupWork } from "./work-groups";

const ICON = {
  task: "M9 11l3 3 5-6M4 6h4M4 12h3M4 18h6",
  clock: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18ZM12 7v5l3 2",
  people: "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1a4 4 0 0 0-3-3.9",
  check: "M20 6 9 17l-5-5",
};

/** Small square glyph used on the dark tiles. */
function Chip({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export async function AdminDashboard({ user }: { user: AppUser }) {
  const supabase = await createClient();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();

  const [
    { data: taskData },
    { data: staffData },
    { data: activityData },
    { data: requestData },
    { data: runData },
    { data: messageData },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, client:clients!inner(name, status), service:services(name), assignee:users!tasks_assigned_to_fkey(name)")
      .eq("client.status", "ACTIVE"),
    supabase.from("users").select("id, name").eq("role", "STAFF").eq("is_active", true).order("name"),
    supabase.from("activity_logs").select(ACTIVITY_SELECT).order("created_at", { ascending: false }).limit(6),
    supabase
      .from("document_requests")
      .select("*, client:clients(name), task:tasks!document_requests_task_id_fkey(id, title)")
      .in("status", ["REQUESTED", "UPLOADED", "UNDER_REVIEW", "REJECTED"])
      .order("due_date", { nullsFirst: false }),
    supabase
      .from("workflow_runs")
      .select("*, client:clients(name), service:services(name)")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("messages")
      .select("*, sender:users!messages_sender_id_fkey(id, name, role)")
      .gte("created_at", weekAgo)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const tasks = (taskData ?? []) as unknown as TaskRow[];
  const open = tasks.filter(isOpen);
  const requests = (requestData ?? []) as unknown as DocumentRequestRow[];
  const runs = (runData ?? []) as unknown as WorkflowRunRow[];
  const messages = ((messageData ?? []) as unknown as Message[]).filter((mm) => !isFromFirm(mm.sender?.role));

  // Progress for the active cycles, from the tasks already loaded above.
  const runTasks: Record<string, { status: TaskStatus }[]> = {};
  for (const t of tasks) {
    if (t.workflow_run_id) (runTasks[t.workflow_run_id] ??= []).push({ status: t.status });
  }

  const toReview = requests.filter((r) => r.status === "UPLOADED" || r.status === "UNDER_REVIEW");
  const outstanding = requests.filter((r) => needsClient(r.status));

  const m = {
    active: open.length,
    overdue: open.filter((t) => isOverdue(t, now)).length,
    waiting: open.filter((t) => t.status === "WAITING_FOR_CLIENT").length,
    review: open.filter((t) => t.status === "UNDER_REVIEW").length,
    today: open.filter((t) => dayKey(t.due_date) === dayKey(now) && !isOverdue(t, now)).length,
  };

  const staffList = (staffData ?? []) as { id: string; name: string }[];
  const workload = staffList
    .map((s) => ({ ...s, n: open.filter((t) => t.assigned_to === s.id).length }))
    .sort((a, b) => b.n - a.n);
  const maxLoad = Math.max(1, ...workload.map((w) => w.n));
  const unassigned = open.filter((t) => !t.assigned_to).length;

  // Status mix of the open work. Colours are fixed per status, so the
  // ring means the same thing on every visit.
  const STATUS_SERIES: { key: TaskStatus; label: string; colour: string }[] = [
    { key: "IN_PROGRESS", label: "In progress", colour: "--lime-500" },
    { key: "WAITING_FOR_CLIENT", label: "Waiting for client", colour: "--violet-400" },
    { key: "UNDER_REVIEW", label: "Under review", colour: "--violet-700" },
    { key: "TODO", label: "To do", colour: "--ink-3" },
  ];
  const statusMix: Slice[] = STATUS_SERIES.map((x) => ({
    key: x.key,
    label: x.label,
    colour: x.colour,
    value: open.filter((t) => t.status === x.key).length,
  }));

  // Open work per service, biggest first, so the busiest area is obvious.
  const byService = new Map<string, number>();
  for (const t of open) {
    const name = t.service?.name ?? "Other";
    byService.set(name, (byService.get(name) ?? 0) + 1);
  }
  const serviceRows: Slice[] = [...byService.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, value]) => ({ key: name, label: name, value, colour: "--lime-500" }));

  // Performance: tasks completed per week over the last eight weeks.
  const weekly: Point[] = [];
  for (let back = 7; back >= 0; back--) {
    const end = new Date(now.getTime() - back * 7 * 864e5);
    const start = new Date(end.getTime() - 7 * 864e5);
    const n = tasks.filter((t) => {
      if (t.status !== "COMPLETED" || !t.completed_at) return false;
      const at = new Date(t.completed_at);
      return at > start && at <= end;
    }).length;
    weekly.push({ label: end.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), value: n });
  }
  const doneTotal = weekly.reduce((n, w) => n + w.value, 0);
  const lastWeek = weekly[weekly.length - 1]?.value ?? 0;
  const prevWeek = weekly[weekly.length - 2]?.value ?? 0;

  const parts: React.ReactNode[] = [];
  if (m.overdue) parts.push(<strong key="o">{plural(m.overdue, "task is", "tasks are")} overdue</strong>);
  if (m.review) parts.push(<span key="r"><strong>{m.review}</strong> waiting for your review</span>);
  if (toReview.length) parts.push(<span key="d"><strong>{plural(toReview.length, "document", "documents")}</strong> to check</span>);
  if (m.today) parts.push(<span key="t"><strong>{m.today}</strong> due later today</span>);

  const firstName = user.name.replace(/^CA\s+/i, "").split(" ")[0];

  return (
    <>
      <div className="page-toolbar">
        <p className="greeting" style={{ margin: 0 }}>{greeting(now)}, {firstName}</p>
        <div className="pt-actions">
          <Link className="pt-btn" href="/tasks?overdue=1">Overdue first</Link>
          <Link className="pt-btn" href="/tasks">All work</Link>
        </div>
      </div>
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

      <div className="dash-grid">
      <section className="hero-card">
        <div className="hero-card-h">
          <h2>Where the firm stands</h2>
          <p>Live across every active client — the work open now, and what is waiting on somebody.</p>
        </div>

        <div className="ledger">
          <Link href="/tasks?status=OPEN"><span className="k"><Chip d={ICON.task} />Tasks</span><span className="n">{m.active}</span><span className="l">Active tasks</span></Link>
          <Link href="/tasks?overdue=1" className={m.overdue ? "alert" : undefined}><span className="k"><Chip d={ICON.clock} />Late</span><span className="n">{m.overdue}</span><span className="l">Overdue</span></Link>
          <Link href="/tasks?status=WAITING_FOR_CLIENT"><span className="k"><Chip d={ICON.people} />Clients</span><span className="n">{m.waiting}</span><span className="l">Waiting for client</span></Link>
          <Link href="/tasks?status=UNDER_REVIEW"><span className="k"><Chip d={ICON.check} />Review</span><span className="n">{m.review}</span><span className="l">Work to review</span></Link>
        </div>

        <div className="ledger sub">
          <Link href="/documents?view=review"><span className="n">{toReview.length}</span><span className="l">Documents to review</span></Link>
          <Link href="/documents?view=open"><span className="n">{outstanding.length}</span><span className="l">Awaited from clients</span></Link>
          <Link href="/workflows"><span className="n">{runs.length}</span><span className="l">Active workflows</span></Link>
          <Link href="/messages"><span className="n">{messages.length}</span><span className="l">Client messages, 7 days</span></Link>
        </div>
      </section>

      {/* The assistant, offered where the work is — not hidden in a menu.
          It answers here; the sidebar page keeps the history. */}
      <aside className="ai-card">
        <DashAssistant />
      </aside>

      {/* Two analysis cards, side by side, under the dark block. */}
      <div className="dash-pair">
        <Panel title="Task mix" padded>
          <Donut slices={statusMix} total={open.length} hint="Open tasks by status" />
        </Panel>

        <section className="lime-card">
          <h3>Document pipeline</h3>
          <div className="lime-chips">
            <span className="lime-chip">Awaited<b>{outstanding.length}</b></span>
            <span className="lime-chip">To review<b>{toReview.length}</b></span>
            <span className="lime-chip">Due today<b>{m.today}</b></span>
          </div>
          <div className="lime-bars" aria-hidden="true">
            <i className="b1" /><i className="b2" /><i className="b3" />
          </div>
        </section>
      </div>
      </div>

      <Panel title="Open work by service" action={<Link className="small" href="/tasks">All tasks</Link>} padded>
        <BarRows rows={serviceRows} hint="Open tasks by service" />
      </Panel>

      <Panel
        title="Performance"
        action={<span className="small muted">Tasks completed per week · last 8 weeks</span>}
        padded
      >
        <div className="perf-head">
          <span><b>{doneTotal}</b><i>completed in 8 weeks</i></span>
          <span><b>{lastWeek}</b><i>this week</i></span>
          <span className={lastWeek >= prevWeek ? "up" : "down"}>
            <b>{lastWeek >= prevWeek ? "+" : ""}{lastWeek - prevWeek}</b><i>vs last week</i>
          </span>
        </div>
        <TrendArea points={weekly} hint="Tasks completed per week over the last eight weeks" />
      </Panel>

      <div className="grid2" style={{ marginTop: 18 }}>
        <div className="stack">
          <Panel title="Client work" action={<Link className="small" href="/clients">All clients</Link>}>
            <WorkList groups={groupWork(tasks, now)} linkClients />
          </Panel>

          <Panel title="Documents needing attention" action={<Link className="small" href="/documents">All documents</Link>}>
            {toReview.length || outstanding.length ? (
              <ul className="list">
                {[...toReview, ...outstanding].slice(0, 8).map((r) => {
                  const s = REQUEST_STATUS[r.status];
                  const late = r.due_date && new Date(r.due_date) < now;
                  return (
                    <li key={r.id}>
                      <span>
                        <Link className="rowlink" href={`/documents/${r.id}`}>{r.title}</Link>
                        <span className="sub">
                          {r.client?.name}
                          {r.due_date ? ` · by ${formatDate(r.due_date)}` : ""}
                        </span>
                      </span>
                      <span className="actions">
                        {late && <span className="badge b-red">Overdue</span>}
                        <span className={`badge ${s.tone ? "b-" + s.tone : ""}`}>{s.label}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="No documents outstanding">
                Everything you asked clients for has been accepted.
              </EmptyState>
            )}
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Active workflows" action={<Link className="small" href="/workflows">All workflows</Link>}>
            {runs.length ? (
              <ul className="list">
                {runs.map((r) => {
                  const p = runProgress(runTasks[r.id] ?? []);
                  return (
                    <li key={r.id}>
                      <span>
                        <Link className="rowlink" href={`/workflows/runs/${r.id}`}>{r.client?.name}</Link>
                        <span className="sub">{r.template_name}, {r.period}</span>
                      </span>
                      <span className="actions">
                        <span className="bar">
                          <i style={{ width: `${p.total ? Math.round((p.done / p.total) * 100) : 0}%` }} />
                        </span>
                        <span className="small right" style={{ width: 52 }}>{p.done}/{p.total}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="No workflow running">
                <Link href="/workflows">Generate a cycle for a client.</Link>
              </EmptyState>
            )}
          </Panel>

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

          <Panel title="From clients" action={<Link className="small" href="/messages">All messages</Link>}>
            {messages.length ? (
              <ul className="list">
                {messages.slice(0, 4).map((mm) => (
                  <li key={mm.id}>
                    <span>
                      <Link className="rowlink" href={`/messages/${mm.client_id}`}>
                        {mm.message.length > 70 ? `${mm.message.slice(0, 70)}…` : mm.message}
                      </Link>
                      <span className="sub">{mm.sender?.name} · {formatDateTime(mm.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No messages this week">Client replies will appear here.</EmptyState>
            )}
          </Panel>

          <Panel title="Recent activity" action={<Link className="small" href="/activity">View all</Link>}>
            <Timeline entries={(activityData ?? []) as unknown as Activity[]} viewerRole="ADMIN" />
          </Panel>
        </div>
      </div>
    </>
  );
}
