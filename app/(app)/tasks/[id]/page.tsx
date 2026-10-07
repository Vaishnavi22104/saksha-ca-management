import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { ACTIVITY_SELECT, Timeline } from "@/components/Timeline";
import { AccessDenied, PageHeader, Panel, PriorityLabel, TaskStatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { ACTION_LABEL, TASK_SELECT, TASK_STATUS, allowedNext, isOpen } from "@/lib/tasks";
import { REQUEST_STATUS } from "@/lib/documents";
import type { Activity, DocumentRequestStatus, TaskRow } from "@/lib/types";
import { changeStatusAction } from "../actions";
import { ReassignForm } from "./ReassignForm";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["ADMIN", "STAFF"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase.from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle();
  if (!data) return <AccessDenied />;
  const task = data as unknown as TaskRow;
  const admin = user.role === "ADMIN";

  const [{ data: activityData }, { data: assignData }, { data: requestData }] = await Promise.all([
    supabase.from("activity_logs").select(ACTIVITY_SELECT).eq("entity_type", "task").eq("entity_id", id)
      .order("created_at", { ascending: false }),
    admin
      ? supabase.from("client_staff").select("staff:users!client_staff_staff_id_fkey(id, name, is_active)").eq("client_id", task.client_id)
      : Promise.resolve({ data: null }),
    supabase.from("document_requests").select("id, title, status").eq("task_id", id).order("created_at"),
  ]);
  const requests = (requestData ?? []) as { id: string; title: string; status: DocumentRequestStatus }[];
  type StaffRef = { id: string; name: string; is_active: boolean };
  const assignable = ((assignData ?? []) as unknown as { staff: StaffRef | null }[])
    .map((r) => r.staff)
    .filter((s): s is StaffRef => !!s && s.is_active);

  const next = allowedNext(user, task);
  let hint = "";
  if (user.role === "STAFF" && task.assigned_to !== user.id) hint = "This task is assigned to someone else, so you can view it but not change it.";
  else if (user.role === "STAFF" && task.status === "UNDER_REVIEW") hint = "Submitted. The CA will approve it or return it to you.";
  else if (user.role === "STAFF" && task.status === "IN_PROGRESS" && task.requires_review) hint = "This task needs CA review, so submit it for review when your work is done.";

  return (
    <>
      <PageHeader
        crumb={<><Link href="/tasks">Tasks</Link> / <Link href={`/clients/${task.client_id}`}>{task.client?.name}</Link></>}
        title={task.title}
        description={<TaskStatusBadge status={task.status} dueDate={task.due_date} />}
        actions={<Link className="btn" href={`/messages/${task.client_id}?task=${task.id}`}>Message client</Link>}
      />
      <div className="grid2">
        <div className="stack">
          <Panel title="Move this task" padded>
            {hint && <div className="notice">{hint}</div>}
            {next.length ? (
              <div className="actions">
                {next.map((to) => (
                  <ActionButton
                    key={to}
                    action={changeStatusAction}
                    fields={{ task_id: task.id, status: to }}
                    label={to === "CANCELLED" ? "Cancel task" : ACTION_LABEL[`${task.status}>${to}`]}
                    className={to === "CANCELLED" ? "btn danger" : to === "COMPLETED" || to === "UNDER_REVIEW" ? "btn primary" : "btn"}
                    confirmText={to === "CANCELLED" ? "Cancel this task? This can't be undone." : undefined}
                  />
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                {isOpen(task)
                  ? "No actions available to you right now."
                  : `This task is ${TASK_STATUS[task.status].label.toLowerCase()} and can't be changed.`}
              </p>
            )}
          </Panel>
          <Panel title="Documents" action={admin || user.role === "STAFF" ? <Link className="small" href={`/documents/new?client=${task.client_id}&task=${task.id}`}>Request a document</Link> : undefined}>
            {requests.length ? (
              <ul className="list">
                {requests.map((r) => (
                  <li key={r.id}>
                    <Link className="rowlink" href={`/documents/${r.id}`}>{r.title}</Link>
                    <span className={`badge ${REQUEST_STATUS[r.status].tone ? "b-" + REQUEST_STATUS[r.status].tone : ""}`}>
                      {REQUEST_STATUS[r.status].label}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="panel-b muted small">No document requested for this task.</div>
            )}
          </Panel>
          <Panel title="History">
            <Timeline entries={(activityData ?? []) as unknown as Activity[]} viewerRole={user.role} />
          </Panel>
        </div>

        <Panel title="Details" padded>
          <dl className="info">
            <dt>Client</dt><dd><Link href={`/clients/${task.client_id}`}>{task.client?.name}</Link></dd>
            <dt>Service</dt><dd>{task.service?.name}</dd>
            <dt>Financial year</dt><dd>{task.financial_year}</dd>
            <dt>Period</dt><dd>{task.period}</dd>
            {task.workflow_run_id && (
              <>
                <dt>Workflow</dt>
                <dd>
                  <Link href={`/workflows/runs/${task.workflow_run_id}`}>
                    Step {task.workflow_step_no ?? "?"} of this cycle
                  </Link>
                  {task.needs_document && <span className="small muted"> · client document expected</span>}
                </dd>
              </>
            )}
            <dt>Due</dt><dd>{formatDate(task.due_date)}, 5:00 PM</dd>
            <dt>Priority</dt><dd><PriorityLabel priority={task.priority} /></dd>
            <dt>CA review</dt><dd>{task.requires_review ? "Required before completion" : "Not required"}</dd>
            <dt>Assigned to</dt>
            <dd>
              {admin && isOpen(task) ? (
                <>
                  <ReassignForm taskId={task.id} current={task.assigned_to} staff={assignable} />
                  {!assignable.length && <span className="small muted">Assign staff to this client first.</span>}
                </>
              ) : (
                task.assignee?.name ?? <span className="muted">Unassigned</span>
              )}
            </dd>
            {task.description && (<><dt>Notes</dt><dd>{task.description}</dd></>)}
          </dl>
        </Panel>
      </div>
    </>
  );
}
