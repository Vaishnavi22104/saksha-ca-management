import Link from "next/link";
import type { ReactNode } from "react";
import { PRIORITY_LABEL, TASK_STATUS, isOverdue } from "@/lib/tasks";
import type { ClientStatus, Priority, TaskStatus } from "@/lib/types";

export function PageHeader(props: { title: string; description?: ReactNode; actions?: ReactNode; crumb?: ReactNode }) {
  return (
    <>
      {props.crumb && <div className="crumb">{props.crumb}</div>}
      <div className="pagehead">
        <div>
          <h1>{props.title}</h1>
          {props.description && <p>{props.description}</p>}
        </div>
        {props.actions && <div className="actions">{props.actions}</div>}
      </div>
    </>
  );
}

export function Panel(props: { title?: string; action?: ReactNode; children: ReactNode; padded?: boolean }) {
  return (
    <section className="panel">
      {props.title && (
        <div className="panel-h">
          <h2>{props.title}</h2>
          {props.action}
        </div>
      )}
      {props.padded ? <div className="panel-b">{props.children}</div> : props.children}
    </section>
  );
}

export function EmptyState(props: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{props.title}</b>
      {props.children}
    </div>
  );
}

export function TaskStatusBadge(props: { status: TaskStatus; dueDate?: string }) {
  const s = TASK_STATUS[props.status];
  const overdue = props.dueDate ? isOverdue({ status: props.status, due_date: props.dueDate }) : false;
  return (
    <span className="nowrap">
      <span className={`badge ${s.tone ? "b-" + s.tone : ""}`}>{s.label}</span>
      {overdue && <> <span className="badge b-red">Overdue</span></>}
    </span>
  );
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return status === "ACTIVE" ? <span className="badge b-green">Active</span> : <span className="badge">Inactive</span>;
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  return <span className={`prio ${priority}`}>{PRIORITY_LABEL[priority]}</span>;
}

export function AccessDenied() {
  return (
    <div className="panel" style={{ marginTop: 40 }}>
      <EmptyState title="You do not have permission to access this resource.">
        <Link href="/dashboard">Go to dashboard</Link>
      </EmptyState>
    </div>
  );
}
