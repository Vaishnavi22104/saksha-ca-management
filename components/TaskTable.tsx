import Link from "next/link";
import { EmptyState, PriorityLabel, TaskStatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { isOpen } from "@/lib/tasks";
import type { TaskRow } from "@/lib/types";

export function TaskTable(props: {
  tasks: TaskRow[];
  showClient?: boolean;
  showAssignee?: boolean;
  linkRows?: boolean;
  emptyTitle?: string;
  emptyText?: string;
}) {
  const { showClient = true, showAssignee = true, linkRows = true } = props;
  if (!props.tasks.length) {
    return <EmptyState title={props.emptyTitle ?? "No tasks match"}>{props.emptyText ?? "Try clearing the filters."}</EmptyState>;
  }
  const rows = [...props.tasks].sort(
    (a, b) => Number(isOpen(b)) - Number(isOpen(a)) || a.due_date.localeCompare(b.due_date),
  );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Task</th>
            {showClient && <th>Client</th>}
            {showAssignee && <th>Assigned to</th>}
            <th>Due</th>
            <th>Priority</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="first">
                {linkRows ? (
                  <Link className="rowlink" href={`/tasks/${t.id}`}>{t.title}</Link>
                ) : (
                  <span className="strong">{t.title}</span>
                )}
                <span className="sub">
                  {t.service?.name}, {t.period}
                </span>
              </td>
              {showClient && <td>{t.client?.name}</td>}
              {showAssignee && <td>{t.assignee?.name ?? <span className="muted">Unassigned</span>}</td>}
              <td className="nowrap">{formatDate(t.due_date)}</td>
              <td><PriorityLabel priority={t.priority} /></td>
              <td><TaskStatusBadge status={t.status} dueDate={t.due_date} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
