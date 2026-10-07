"use client";

import { useActionState } from "react";
import { changePassword } from "./actions";
import { Field, FormAlert, SubmitButton } from "@/components/forms";

export function ChangePasswordForm({ email }: { email: string }) {
  const [state, action] = useActionState(changePassword, {});
  return (
    <form className="auth-card" action={action}>
      <h2>Change password</h2>
      <p className="muted" style={{ margin: "0 0 20px" }}>Signed in as {email}</p>
      <FormAlert state={state} />
      <Field label="New password" name="password" state={state} hint="At least 8 characters, different from the temporary one.">
        <input id="f-password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm new password" name="confirm" state={state}>
        <input id="f-confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="btn primary block">Save password and continue</SubmitButton>
    </form>
  );
}
