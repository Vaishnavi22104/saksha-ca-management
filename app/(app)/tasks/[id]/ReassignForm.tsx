"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms";
import { reassignTaskAction } from "../actions";

export function ReassignForm(props: { taskId: string; current: string | null; staff: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(reassignTaskAction, {});
  return (
    <form action={formAction} className="actions">
      <input type="hidden" name="task_id" value={props.taskId} />
      <label className="sr-only" htmlFor="assigned_to">Assignee</label>
      <select id="assigned_to" name="assigned_to" defaultValue={props.current ?? ""}>
        <option value="">Unassigned</option>
        {props.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <SubmitButton className="btn sm">Save</SubmitButton>
      {state.error && <span className="small" role="alert" style={{ color: "var(--danger)" }}>{state.error}</span>}
      {state.message && <span className="small muted" role="status">{state.message}</span>}
    </form>
  );
}
