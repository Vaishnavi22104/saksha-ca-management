"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "./actions";
import { Field, FormAlert, SubmitButton } from "@/components/forms";

export function ForgotForm({ notice }: { notice?: string }) {
  const [state, action] = useActionState(requestPasswordReset, {});
  return (
    <form className="auth-card" action={action}>
      <h2>Reset your password</h2>
      <p className="muted" style={{ margin: "0 0 20px" }}>
        Enter the email you sign in with and we&apos;ll send you a link to choose a new password.
      </p>
      {notice && !state.ok && <div className="notice warn">{notice}</div>}
      <FormAlert state={state} />
      {!state.ok && (
        <>
          <Field label="Email" name="email" state={state}>
            <input id="f-email" name="email" type="email" autoComplete="username" required />
          </Field>
          <SubmitButton className="btn primary block" pendingText="Sending…">Send reset link</SubmitButton>
        </>
      )}
      <p className="small" style={{ marginTop: 16 }}>
        <Link href="/login">← Back to sign in</Link>
      </p>
    </form>
  );
}
