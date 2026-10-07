"use client";

import { useActionState } from "react";
import { resetPassword } from "./actions";
import { Field, FormAlert, SubmitButton } from "@/components/forms";

export function ResetForm({ email }: { email: string }) {
  const [state, action] = useActionState(resetPassword, {});
  return (
    <form className="auth-card" action={action}>
      <h2>Choose a new password</h2>
      <p className="muted" style={{ margin: "0 0 20px" }}>For {email}</p>
      <FormAlert state={state} />
      <Field label="New password" name="password" state={state} hint="At least 8 characters.">
        <input id="f-password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm new password" name="confirm" state={state}>
        <input id="f-confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="btn primary block">Save new password</SubmitButton>
    </form>
  );
}
