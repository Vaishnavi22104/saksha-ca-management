"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms";
import { createRequestAction } from "./actions";

type Option = { id: string; name: string };
type TaskOption = { id: string; client_id: string; title: string; period: string };

export function RequestForm(props: {
  clients: Option[];
  tasks: TaskOption[];
  defaultClientId?: string;
  defaultTaskId?: string;
}) {
  const [state, formAction] = useActionState(createRequestAction, {});
  const [clientId, setClientId] = useState(props.defaultClientId ?? props.clients[0]?.id ?? "");
  const tasks = props.tasks.filter((t) => t.client_id === clientId);

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

      <Field label="What do you need? *" name="title" state={state} hint="The client sees this exact wording.">
        <input id="f-title" name="title" type="text" placeholder="e.g. September bank statement" required />
      </Field>

      <Field label="Notes for the client" name="description" state={state} hint="Optional. Any detail that avoids a wrong file.">
        <input id="f-description" name="description" type="text" placeholder="e.g. All pages, including the summary" />
      </Field>

      <div className="fields2">
        <Field label="Linked task" name="task_id" state={state} hint="Optional. Connects the file to the work it blocks.">
          <select id="f-task_id" name="task_id" defaultValue={props.defaultTaskId ?? ""} key={clientId}>
            <option value="">Not linked to a task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.title} ({t.period})</option>
            ))}
          </select>
        </Field>
        <Field label="Needed by" name="due" state={state} hint="Optional. Due at 5:00 PM IST.">
          <input id="f-due" name="due" type="date" />
        </Field>
      </div>

      <div className="formfoot">
        <SubmitButton>Send request</SubmitButton>
        <Link className="btn" href="/documents">Cancel</Link>
      </div>
    </form>
  );
}
