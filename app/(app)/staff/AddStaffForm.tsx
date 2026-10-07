"use client";

import { useActionState } from "react";
import { CredentialsNotice, Field, FormAlert, SubmitButton } from "@/components/forms";
import { createStaffAction } from "./actions";

export function AddStaffForm() {
  // key trick: remount the form after success so the inputs clear
  const [state, formAction] = useActionState(createStaffAction, {});
  return (
    <div className="panel-b">
      <CredentialsNotice state={state} />
      <form action={formAction} key={state.credentials?.email ?? "new"} noValidate>
        <FormAlert state={state.ok ? undefined : state} />
        <div className="fields2">
          <Field label="Full name *" name="name" state={state}>
            <input id="f-name" name="name" type="text" required />
          </Field>
          <Field label="Work email *" name="email" state={state}>
            <input id="f-email" name="email" type="email" required />
          </Field>
        </div>
        <SubmitButton pendingText="Adding…">Add staff member</SubmitButton>
      </form>
    </div>
  );
}
