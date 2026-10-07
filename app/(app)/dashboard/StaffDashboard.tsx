import { Panel } from "@/components/ui";
import { TaskTable } from "@/components/TaskTable";
import { createClient } from "@/lib/supabase/server";
import { greeting, plural } from "@/lib/format";
import { TASK_SELECT, isOpen, isOverdue } from "@/lib/tasks";
import type { AppUser, TaskRow } from "@/lib/types";

export async function StaffDashboard({ user }: { user: AppUser }) {
  const supabase = await createClient();
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 864e5);

  const [{ data }, { count: clientCount }] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).eq("assigned_to", user.id),
    supabase.from("client_staff").select("client_id", { count: "exact", head: true }).eq("staff_id", user.id),
  ]);
  const mine = (data ?? []) as unknown as TaskRow[];
  const open = mine.filter(isOpen);
  const overdue = open.filter((t) => isOverdue(t, now));

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
      <p className="greeting">{greeting(now)}, {user.name.split(" ")[0]}</p>
      <p className="summary">
        You have <strong>{plural(open.length, "open task", "open tasks")}</strong>
        {overdue.length > 0 && <>, and <strong>{overdue.length} overdue</strong></>}.{" "}
        {plural(clientCount ?? 0, "client is", "clients are")} assigned to you.
      </p>
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
