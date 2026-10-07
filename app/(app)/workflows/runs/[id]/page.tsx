import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { TaskTable } from "@/components/TaskTable";
import { AccessDenied, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, plural } from "@/lib/format";
import { TASK_SELECT } from "@/lib/tasks";
import { WORKFLOW_STATUS, runProgress } from "@/lib/workflows";
import { ProgressDial } from "@/components/WorkflowVisuals";
import type { TaskRow, TaskStatus, WorkflowRun } from "@/lib/types";
import { cancelRunAction, closeRunAction } from "../../actions";

export default async function WorkflowRunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["ADMIN", "STAFF"]);
  const { id } = await params;
  const supabase = await createClient();

  // RLS hides runs this user may not see, which looks the same as "not found".
  const { data } = await supabase
    .from("workflow_runs")
    .select("*, client:clients(name), service:services(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return <AccessDenied />;
  const run = data as unknown as WorkflowRun & { client: { name: string } | null; service: { name: string } | null };

  const { data: taskData } = await supabase.from("tasks").select(TASK_SELECT).eq("workflow_run_id", id);
  const tasks = (taskData ?? []) as unknown as TaskRow[];
  const progress = runProgress(tasks);
  const only = (...s: TaskStatus[]) => tasks.filter((t) => s.includes(t.status)).length;
  const counts = {
    done: only("COMPLETED"),
    doing: only("IN_PROGRESS"),
    review: only("UNDER_REVIEW"),
    todo: only("TODO", "WAITING_FOR_CLIENT"),
  };
  const status = WORKFLOW_STATUS[run.status];
  const admin = user.role === "ADMIN";
  const live = run.status === "ACTIVE";

  return (
    <>
      <PageHeader
        crumb={<Link href="/workflows">Workflows</Link>}
        title={`${run.template_name} — ${run.client?.name ?? "Client"}`}
        description={
          <>
            <span className={`badge ${status.tone ? "b-" + status.tone : ""}`}>{status.label}</span>{" "}
            <span className="muted">
              {run.service?.name} · {run.period} · {run.financial_year} · started {formatDate(run.created_at)}
            </span>
          </>
        }
        actions={
          admin && live ? (
            <>
              <ActionButton
                action={closeRunAction}
                fields={{ run_id: id, force: progress.open > 0 ? "true" : "false" }}
                className={progress.open > 0 ? "btn" : "btn primary"}
                label={progress.open > 0 ? "Close anyway" : "Close workflow"}
                confirmText={
                  progress.open > 0
                    ? `${progress.open} task(s) are still open. Close this workflow anyway? The open tasks stay as they are.`
                    : undefined
                }
              />
              <ActionButton
                action={cancelRunAction}
                fields={{ run_id: id }}
                label="Cancel workflow"
                confirmText="Cancel this workflow? Every task in it that isn't finished will be cancelled too."
              />
            </>
          ) : null
        }
      />

      <div className="stack">
        <div className="wf-runhero">
          <ProgressDial done={progress.done} total={progress.total} size={104} />
          <div className="wf-runhero-b">
            <b>{progress.done} of {progress.total} tasks completed</b>
            <span className="muted">
              {progress.open > 0
                ? plural(progress.open, "task still open", "tasks still open")
                : "Nothing outstanding."}
              {run.completed_at && <> Closed {formatDate(run.completed_at)}.</>}
            </span>
            <div className="wf-runbar" aria-hidden="true">
              <i style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
            </div>
          </div>
          <div className="wf-runhero-n">
            <span><b>{counts.done}</b> done</span>
            <span><b>{counts.doing}</b> in progress</span>
            <span><b>{counts.review}</b> under review</span>
            <span><b>{counts.todo}</b> to do</span>
          </div>
        </div>

        <Panel title="Tasks in this workflow">
          <TaskTable
            tasks={tasks}
            showClient={false}
            emptyTitle="No tasks"
            emptyText="This workflow has no tasks."
          />
        </Panel>
      </div>
    </>
  );
}
