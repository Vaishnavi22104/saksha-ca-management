"use client";

import { useActionState } from "react";
import { Field, SubmitButton, FormAlert } from "@/components/forms";
import { changePasswordAction } from "./actions";
import type { ActionState } from "@/lib/types";

export function ChangePasswordSection() {
  const [state, action] = useActionState(changePasswordAction, {} as ActionState);

  return (
    <section className="panel">
      <div className="panel-h"><h3>Change password</h3></div>
      <div className="panel-b padded">
        <form action={action} className="stack">
          <FormAlert state={state} />

          <Field label="Current password" name="current" state={state}>
            <input id="f-current" name="current" type="password" autoComplete="current-password" required />
          </Field>

          <Field label="New password" name="password" state={state} hint="At least 8 characters">
            <input id="f-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>

          <Field label="Confirm new password" name="confirm" state={state}>
            <input id="f-confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>

          <div className="formfoot">
            <SubmitButton pendingText="Changing…">Change password</SubmitButton>
          </div>
        </form>
      </div>
    </section>
  );
}
