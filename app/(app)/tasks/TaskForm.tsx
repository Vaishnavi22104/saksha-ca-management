"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms";
import { createTaskAction } from "./actions";

type Option = { id: string; name: string };

export function TaskForm(props: {
  clients: Option[];
  services: Option[];
  staffByClient: Record<string, Option[]>;
  defaultClientId?: string;
  defaultDue: string;
  financialYears: string[];
}) {
  const [state, formAction] = useActionState(createTaskAction, {});
  const [clientId, setClientId] = useState(props.defaultClientId ?? props.clients[0]?.id ?? "");
  const assignable = props.staffByClient[clientId] ?? [];

  if (!props.clients.length) {
    return (
      <div className="panel panel-b narrow">
        <div className="empty"><b>No active clients</b><Link href="/clients/new">Add a client first.</Link></div>
      </div>
    );
  }

  return (
    <form action={formAction} className="panel panel-b narrow" noValidate>
      <FormAlert state={state} />
      <Field label="Client *" name="client_id" state={state}>
        <select id="f-client_id" name="client_id" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          {props.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Task title *" name="title" state={state}>
        <input id="f-title" name="title" type="text" placeholder="e.g. Collect purchase bills" required />
      </Field>
      <div className="fields2">
        <Field label="Service *" name="service_id" state={state}>
          <select id="f-service_id" name="service_id">
            {props.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Financial year" name="financial_year" state={state}>
          <select id="f-financial_year" name="financial_year">
            {props.financialYears.map((fy) => <option key={fy}>{fy}</option>)}
          </select>
        </Field>
        <Field label="Period *" name="period" state={state} hint="For example September 2026 or Q2 FY 2026-27.">
          <input id="f-period" name="period" type="text" required />
        </Field>
        <Field label="Due date *" name="due" state={state} hint="Due at 5:00 PM IST.">
          <input id="f-due" name="due" type="date" defaultValue={props.defaultDue} required />
        </Field>
        <Field label="Priority" name="priority" state={state}>
          <select id="f-priority" name="priority" defaultValue="MEDIUM">
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </Field>
        <Field label="Assign to" name="assigned_to" state={state} hint="Only staff assigned to this client.">
          <select id="f-assigned_to" name="assigned_to" key={clientId}>
            <option value="">Unassigned</option>
            {assignable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes" name="description" state={state}>
        <textarea id="f-description" name="description" rows={3} />
      </Field>
      <p>
        <label className="check">
          <input type="checkbox" name="requires_review" defaultChecked /> Needs CA review before completion
        </label>
      </p>
      <div className="formfoot">
        <Link className="btn" href="/tasks">Cancel</Link>
        <SubmitButton pendingText="Creating…">Create task</SubmitButton>
      </div>
    </form>
  );
}
