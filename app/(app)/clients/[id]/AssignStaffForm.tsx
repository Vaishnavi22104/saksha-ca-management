"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms";
import { assignStaffAction } from "../actions";

export function AssignStaffForm({ clientId, staff }: { clientId: string; staff: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(assignStaffAction, {});
  return (
    <form action={formAction} className="filters" style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}>
      <input type="hidden" name="client_id" value={clientId} />
      <label className="sr-only" htmlFor="staff_id">Staff member</label>
      <select id="staff_id" name="staff_id">
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <SubmitButton className="btn sm primary" pendingText="Assigning…">Assign</SubmitButton>
      {state.error && <span className="small" role="alert" style={{ color: "var(--danger)" }}>{state.error}</span>}
    </form>
  );
}
