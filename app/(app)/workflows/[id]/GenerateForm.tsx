"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms";
import { StepNeeds, type FlowStep } from "@/components/WorkflowVisuals";
import { generateWorkflowAction } from "../actions";

type Option = { id: string; name: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Sep" for an ISO day plus an offset, computed in UTC so no timezone shifts it. */
function dayPlus(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 864e5);
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}

/** Sensible period labels, so the CA rarely types this field. */
function periodSuggestions() {
  const now = new Date();
  const label = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return [label(lastMonth), label(thisMonth), `Q${q} ${now.getUTCFullYear()}`];
}

/**
 * Generating twice for the same client, service and period is blocked by
 * the database. When that happens the CA can tick "create another" and
 * submit again, which is the deliberate second action the plan calls for.
 */
export function GenerateForm(props: {
  templateId: string;
  clients: Option[];
  staffByClient: Record<string, Option[]>;
  financialYears: string[];
  defaultDue: string;
  stepCount: number;
  steps: FlowStep[];
}) {
  const [state, formAction] = useActionState(generateWorkflowAction, {});
  const [clientId, setClientId] = useState(props.clients[0]?.id ?? "");
  const [due, setDue] = useState(props.defaultDue);
  const [period, setPeriod] = useState("");
  const assignable = props.staffByClient[clientId] ?? [];
  const duplicate = !!state.error && state.error.includes("already exists");
  const clientName = props.clients.find((c) => c.id === clientId)?.name;

  if (!props.clients.length) {
    return (
      <div className="empty">
        <b>No active clients</b>
        <Link href="/clients/new">Add a client first.</Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="panel-b wf-genform" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="template_id" value={props.templateId} />

      <Field label="Client *" name="client_id" state={state}>
        <select id="f-client_id" name="client_id" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          {props.clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>

      <Field label="Period *" name="period" state={state} hint="What this cycle covers.">
        <input
          id="f-period"
          name="period"
          type="text"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="September 2026"
          required
        />
      </Field>
      <div className="wf-chips">
        {periodSuggestions().map((p) => (
          <button key={p} type="button" className={`wf-chip${period === p ? " is-on" : ""}`} onClick={() => setPeriod(p)}>
            {p}
          </button>
        ))}
      </div>

      <div className="fields2">
        <Field label="Start date *" name="due" state={state} hint="Step 1 is due on this date.">
          <input id="f-due" name="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} required />
        </Field>
        <Field label="Financial year" name="financial_year" state={state}>
          <select id="f-financial_year" name="financial_year">
            {props.financialYears.map((fy) => <option key={fy}>{fy}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Assign every task to" name="assigned_to" state={state} hint="Optional. Only staff assigned to this client.">
        <select id="f-assigned_to" name="assigned_to" defaultValue="">
          <option value="">Leave unassigned</option>
          {assignable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>

      {/* The whole point of the screen: exactly what is about to be created. */}
      <div className="wf-sched">
        <div className="wf-sched-h">
          <b>About to create {props.stepCount} tasks</b>
          {clientName && <span>for {clientName}</span>}
        </div>
        <ol className="wf-sched-l">
          {props.steps.map((s, i) => (
            <li key={i}>
              <span className="wf-sched-d">{due ? dayPlus(due, s.due_offset_days) : "—"}</span>
              <span className="wf-sched-t">
                {s.title}
                <span className="wf-sched-n"><StepNeeds step={s} compact /></span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {duplicate && (
        <div className="check" style={{ marginBottom: 14 }}>
          <input id="f-allow_duplicate" name="allow_duplicate" type="checkbox" />
          <label htmlFor="f-allow_duplicate">
            Create another workflow for this period anyway. Use this only when the firm really does the cycle twice.
          </label>
        </div>
      )}

      <div className="formfoot">
        <SubmitButton pendingText="Generating…">Generate {props.stepCount} tasks</SubmitButton>
      </div>
    </form>
  );
}
