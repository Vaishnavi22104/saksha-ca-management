import Link from "next/link";
import { redirect } from "next/navigation";
import { Pager } from "@/components/Pager";
import { cleanSearch } from "@/lib/search";
import { isOutOfRange, pageHref, parsePage, rangeFor } from "@/lib/pagination";
import { PageHeader, Panel } from "@/components/ui";
import { TaskTable } from "@/components/TaskTable";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TASK_SELECT, TASK_STATUS } from "@/lib/tasks";
import type { TaskRow, TaskStatus } from "@/lib/types";

type SP = { q?: string; status?: string; client?: string; assignee?: string; priority?: string; overdue?: string; page?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(["ADMIN", "STAFF"]);
  const f = await searchParams;
  const supabase = await createClient();

  const page = parsePage(f.page);
  const { from, to } = rangeFor(page);
  const q = cleanSearch(f.q ?? "");

  let query = supabase.from("tasks").select(TASK_SELECT, { count: "exact" }).order("due_date").order("id");
  if (user.role === "STAFF") query = query.eq("assigned_to", user.id);
  if (f.client) query = query.eq("client_id", f.client);
  if (f.priority && ["LOW", "MEDIUM", "HIGH"].includes(f.priority)) query = query.eq("priority", f.priority);
  if (f.status && f.status in TASK_STATUS) query = query.eq("status", f.status as TaskStatus);
  if (f.status === "OPEN") query = query.not("status", "in", "(COMPLETED,CANCELLED)");
  if (user.role === "ADMIN" && f.assignee) {
    query = f.assignee === "none" ? query.is("assigned_to", null) : query.eq("assigned_to", f.assignee);
  }

  // Search the task title, or any task whose client's name matches.
  if (q) {
    const { data: hits } = await supabase.from("clients").select("id").ilike("name", `%${q}%`).limit(50);
    const ids = (hits ?? []).map((c: { id: string }) => c.id);
    query = ids.length
      ? query.or(`title.ilike.%${q}%,client_id.in.(${ids.join(",")})`)
      : query.ilike("title", `%${q}%`);
  }
  // Overdue is derived, never stored: open and past its due time.
  if (f.overdue) {
    query = query.lt("due_date", new Date().toISOString()).not("status", "in", "(COMPLETED,CANCELLED)");
  }

  const [{ data, count, error }, { data: clients }, { data: staff }] = await Promise.all([
    query.range(from, to),
    supabase.from("clients").select("id, name").order("name"),
    user.role === "ADMIN"
      ? supabase.from("users").select("id, name").eq("role", "STAFF").order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const clientOptions = (clients ?? []) as { id: string; name: string }[];
  const staffOptions = (staff ?? []) as { id: string; name: string }[];
  if (isOutOfRange(error)) redirect(pageHref("/tasks", { ...f, page: undefined }, 1));
  const tasks = (data ?? []) as unknown as TaskRow[];
  const total = count ?? tasks.length;

  return (
    <>
      <PageHeader
        title={user.role === "STAFF" ? "My tasks" : "Tasks"}
        description={user.role === "STAFF" ? "Tasks assigned to you." : "All work across your clients."}
        actions={user.role === "ADMIN" && <Link className="btn primary" href="/tasks/new">New task</Link>}
      />
      <Panel>
        <form className="filters" method="get">
          <label className="sr-only" htmlFor="q">Search tasks</label>
          <input id="q" name="q" type="search" placeholder="Search task or client" defaultValue={f.q} />
          <label className="sr-only" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={f.status ?? ""}>
            <option value="">All statuses</option>
            <option value="OPEN">Open (not done)</option>
            {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="client">Client</label>
          <select id="client" name="client" defaultValue={f.client ?? ""}>
            <option value="">All clients</option>
            {clientOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {user.role === "ADMIN" && (
            <>
              <label className="sr-only" htmlFor="assignee">Assigned to</label>
              <select id="assignee" name="assignee" defaultValue={f.assignee ?? ""}>
                <option value="">Anyone</option>
                {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="none">Unassigned</option>
              </select>
            </>
          )}
          <label className="sr-only" htmlFor="priority">Priority</label>
          <select id="priority" name="priority" defaultValue={f.priority ?? ""}>
            <option value="">Any priority</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <label className="check">
            <input type="checkbox" name="overdue" value="1" defaultChecked={!!f.overdue} /> Overdue only
          </label>
          <button className="btn sm" type="submit">Apply</button>
          <Link className="small" href="/tasks">Clear</Link>
          <span className="muted small">{total} {total === 1 ? "task" : "tasks"}</span>
        </form>
        <TaskTable tasks={tasks} showAssignee={user.role === "ADMIN"} />
        <Pager path="/tasks" params={{ ...f, page: undefined }} page={page} total={total} />
      </Panel>
    </>
  );
}
