import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { AccessDenied, EmptyState, PageHeader, Panel } from "@/components/ui";
import { ProgressDial, ServiceIcon, StepCounts, StepFlow, serviceGlyph } from "@/components/WorkflowVisuals";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentFinancialYear, dayKey, formatDate } from "@/lib/format";
import { RUN_SELECT, TEMPLATE_SELECT, WORKFLOW_STATUS, groupTasksByRun, runProgress, sortSteps } from "@/lib/workflows";
import type { TaskStatus, WorkflowRunRow, WorkflowTemplateRow } from "@/lib/types";
import { setTemplateActiveAction } from "../actions";
import { GenerateForm } from "./GenerateForm";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["ADMIN"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase.from("workflow_templates").select(TEMPLATE_SELECT).eq("id", id).maybeSingle();
  if (!data) return <AccessDenied />;
  const template = data as unknown as WorkflowTemplateRow;
  const steps = sortSteps(template.steps ?? []);

  const [{ data: clients }, { data: assignments }, { data: runData }, { data: runTaskData }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("status", "ACTIVE").order("name"),
    supabase.from("client_staff").select("client_id, staff:users!client_staff_staff_id_fkey(id, name, is_active)"),
    supabase.from("workflow_runs").select(RUN_SELECT).eq("template_id", id).order("created_at", { ascending: false }).limit(15),
    supabase.from("tasks").select("workflow_run_id, status").not("workflow_run_id", "is", null),
  ]);
  const tasksByRun = groupTasksByRun((runTaskData ?? []) as { workflow_run_id: string | null; status: TaskStatus }[]);

  const staffByClient: Record<string, { id: string; name: string }[]> = {};
  type Assignment = { client_id: string; staff: { id: string; name: string; is_active: boolean } | null };
  for (const a of (assignments ?? []) as unknown as Assignment[]) {
    if (!a.staff?.is_active) continue;
    (staffByClient[a.client_id] ??= []).push({ id: a.staff.id, name: a.staff.name });
  }

  const runs = (runData ?? []) as unknown as WorkflowRunRow[];
  const fy = currentFinancialYear();
  const [y] = fy.split("-").map(Number);
  const previousFy = `${y - 1}-${String(y % 100).padStart(2, "0")}`;
  const canGenerate = template.is_active && steps.length > 0;

  return (
    <>
      <PageHeader
        crumb={<Link href="/workflows">Workflows</Link>}
        title={template.name}
        actions={
          <>
            <Link className="btn" href={`/workflows/${id}/edit`}>Edit steps</Link>
            <ActionButton
              action={setTemplateActiveAction}
              fields={{ template_id: id, active: String(!template.is_active) }}
              label={template.is_active ? "Archive" : "Restore"}
              confirmText={
                template.is_active
                  ? "Archive this template? Workflows already generated are not affected."
                  : undefined
              }
            />
          </>
        }
      />

      <div className="wf-hero">
        <span className={`wf-badge-icon lg g-${serviceGlyph(template.service?.name)}`}>
          <ServiceIcon service={template.service?.name} size={28} />
        </span>
        <div className="wf-hero-b">
          <span className="wf-hero-s">
            {template.service?.name}
            {template.is_active ? <span className="wf-live">Active</span> : <span className="badge">Archived</span>}
          </span>
          {template.description && <p>{template.description}</p>}
          {steps.length > 0 && <StepCounts steps={steps} />}
        </div>
        {canGenerate && <a className="btn primary" href="#generate">Generate for a client</a>}
      </div>

      <div className="grid2">
        <div className="stack">
          <Panel title="The cycle, step by step">
            {steps.length ? (
              <div className="panel-b">
                <StepFlow steps={steps} />
              </div>
            ) : (
              <EmptyState title="No steps yet">
                <Link href={`/workflows/${id}/edit`}>Add the steps of this cycle.</Link>
              </EmptyState>
            )}
          </Panel>

          <Panel title="Workflows from this template">
            {runs.length ? (
              <div className="panel-b">
                <div className="wf-runs">
                  {runs.map((r) => {
                    const p = runProgress(tasksByRun[r.id] ?? []);
                    const s = WORKFLOW_STATUS[r.status];
                    return (
                      <Link key={r.id} className="wf-run" href={`/workflows/runs/${r.id}`}>
                        <ProgressDial done={p.done} total={p.total} size={58} />
                        <div className="wf-run-b">
                          <span className="wf-run-t">{r.client?.name ?? "Client"}</span>
                          <span className="wf-run-s">{r.period} · {r.financial_year}</span>
                          <span className="wf-run-m">
                            <span className={`badge ${s.tone ? "b-" + s.tone : ""}`}>{s.label}</span>
                            <span className="muted">{p.done}/{p.total} done · {formatDate(r.created_at)}</span>
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyState title="Not used yet">Generate this workflow for a client to see it here.</EmptyState>
            )}
          </Panel>
        </div>

        <section className="panel wf-gen" id="generate">
          <div className="panel-h">
            <h2>Generate workflow</h2>
            {canGenerate && <span className="muted small">{steps.length} tasks</span>}
          </div>
          {canGenerate ? (
            <GenerateForm
              templateId={id}
              clients={(clients ?? []) as { id: string; name: string }[]}
              staffByClient={staffByClient}
              financialYears={[fy, previousFy]}
              defaultDue={dayKey(Date.now() + 5 * 864e5)}
              stepCount={steps.length}
              steps={steps}
            />
          ) : (
            <div className="panel-b">
              <div className="notice">
                {template.is_active
                  ? "Add at least one step before generating work."
                  : "This template is archived. Restore it to generate new work."}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
