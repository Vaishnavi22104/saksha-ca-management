import Link from "next/link";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { FlowLegend, ProgressDial, StatTile, TemplateCard } from "@/components/WorkflowVisuals";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, plural } from "@/lib/format";
import { RUN_SELECT, TEMPLATE_SELECT, WORKFLOW_STATUS, groupTasksByRun, runProgress, sortSteps } from "@/lib/workflows";
import type { TaskStatus, WorkflowRunRow, WorkflowTemplateRow } from "@/lib/types";

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireUser(["ADMIN"]);
  const { show } = await searchParams;
  const showArchived = show === "archived";

  const supabase = await createClient();
  let templateQuery = supabase.from("workflow_templates").select(TEMPLATE_SELECT).order("name");
  if (!showArchived) templateQuery = templateQuery.eq("is_active", true);

  const [{ data: templateData }, { data: runData }, { data: taskData }] = await Promise.all([
    templateQuery,
    supabase.from("workflow_runs").select(RUN_SELECT).order("created_at", { ascending: false }).limit(25),
    supabase.from("tasks").select("workflow_run_id, status").not("workflow_run_id", "is", null),
  ]);

  const templates = (templateData ?? []) as unknown as WorkflowTemplateRow[];
  const runs = (runData ?? []) as unknown as WorkflowRunRow[];
  const tasksByRun = groupTasksByRun((taskData ?? []) as { workflow_run_id: string | null; status: TaskStatus }[]);

  // Headline numbers, computed rather than stored.
  const active = templates.filter((t) => t.is_active);
  const liveRuns = runs.filter((r) => r.status === "ACTIVE");
  const tasksMade = Object.values(tasksByRun).reduce((n, rows) => n + rows.length, 0);
  const openNow = liveRuns.reduce((n, r) => n + runProgress(tasksByRun[r.id] ?? []).open, 0);

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Describe a service cycle once. Generating it builds the whole task list for one client and one period."
        actions={<Link className="btn primary" href="/workflows/new">New template</Link>}
      />

      <div className="stack">
        <div className="wf-tiles">
          <StatTile label="Templates ready" value={active.length} hint={showArchived ? `${templates.length - active.length} archived` : undefined} tone="ink" />
          <StatTile label="Workflows running" value={liveRuns.length} tone="violet" />
          <StatTile label="Tasks still open" value={openNow} tone="lime" />
          <StatTile label="Tasks created from templates" value={tasksMade} hint="typed by nobody" tone="ink" />
        </div>

        <Panel
          title="Template library"
          action={
            <Link className="linkbtn" href={showArchived ? "/workflows" : "/workflows?show=archived"}>
              {showArchived ? "Hide archived" : "Show archived"}
            </Link>
          }
        >
          {templates.length ? (
            <div className="panel-b">
              <div className="wf-gallery">
                {templates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    id={t.id}
                    name={t.name}
                    service={t.service?.name}
                    description={t.description}
                    isActive={t.is_active}
                    steps={sortSteps(t.steps ?? [])}
                  />
                ))}

                <Link className="wf-card wf-card-new" href="/workflows/new">
                  <span className="wf-plus" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  <b>New template</b>
                  <span>Start from a GST, TDS or ITR outline, or build your own.</span>
                </Link>
              </div>
              <FlowLegend />
            </div>
          ) : (
            <EmptyState title="No templates yet">
              <Link href="/workflows/new">Create your first workflow template.</Link>
            </EmptyState>
          )}
        </Panel>

        <Panel title="Recent workflows">
          {runs.length ? (
            <div className="panel-b">
              <div className="wf-runs">
                {runs.map((r) => {
                  const p = runProgress(tasksByRun[r.id] ?? []);
                  const s = WORKFLOW_STATUS[r.status];
                  return (
                    <Link key={r.id} className="wf-run" href={`/workflows/runs/${r.id}`}>
                      <ProgressDial done={p.done} total={p.total} size={64} />
                      <div className="wf-run-b">
                        <span className="wf-run-t">{r.client?.name ?? "Client"}</span>
                        <span className="wf-run-s">{r.template_name} · {r.period}</span>
                        <span className="wf-run-m">
                          <span className={`badge ${s.tone ? "b-" + s.tone : ""}`}>{s.label}</span>
                          <span className="muted">
                            {p.done}/{p.total} done
                            {p.open > 0 && <> · {plural(p.open, "open", "open")}</>}
                            {" · "}{formatDate(r.created_at)}
                          </span>
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState title="No workflows generated yet">
              Open a template and press Generate to create a client&apos;s task list in one step.
            </EmptyState>
          )}
        </Panel>
      </div>
    </>
  );
}
