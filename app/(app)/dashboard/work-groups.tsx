import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { TASK_STATUS, isOpen, isOverdue } from "@/lib/tasks";
import type { TaskRow, TaskStatus } from "@/lib/types";

const STAGE_ORDER: TaskStatus[] = ["WAITING_FOR_CLIENT", "UNDER_REVIEW", "IN_PROGRESS", "TODO", "COMPLETED", "CANCELLED"];

interface Group {
  key: string;
  clientId: string;
  clientName: string;
  serviceName: string;
  period: string;
  total: number;
  done: number;
  overdue: number;
  stage: TaskStatus;
}

/** Groups tasks into "one client, one service, one period" cycles. */
export function groupWork(tasks: TaskRow[], now = new Date()): Group[] {
  const map = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (t.status === "CANCELLED") continue;
    const key = `${t.client_id}|${t.service_id}|${t.period}`;
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  return [...map.entries()]
    .map(([key, list]) => {
      const open = list.filter(isOpen);
      return {
        key,
        clientId: list[0].client_id,
        clientName: list[0].client?.name ?? "",
        serviceName: list[0].service?.name ?? "",
        period: list[0].period,
        total: list.length,
        done: list.length - open.length,
        overdue: open.filter((t) => isOverdue(t, now)).length,
        stage: open.length ? STAGE_ORDER.find((s) => open.some((t) => t.status === s))! : "COMPLETED",
      };
    })
    .sort((a, b) => b.overdue - a.overdue || STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
}

export function WorkList({ groups, linkClients }: { groups: Group[]; linkClients: boolean }) {
  if (!groups.length) {
    return <EmptyState title="No work yet">Tasks will be grouped here by client and period.</EmptyState>;
  }
  return (
    <ul className="list">
      {groups.map((g) => {
        const s = TASK_STATUS[g.stage];
        return (
          <li key={g.key}>
            <div>
              {linkClients ? <Link href={`/clients/${g.clientId}`}>{g.clientName}</Link> : <span className="strong">{g.serviceName}</span>}
              <span className="sub">
                {linkClients ? `${g.serviceName}, ` : ""}
                {g.period} · {g.done} of {g.total} tasks done
              </span>
            </div>
            <div className="actions">
              {g.overdue > 0 && <span className="badge b-red">{g.overdue} overdue</span>}
              <span className={`badge ${s.tone ? "b-" + s.tone : ""}`}>{s.label}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
