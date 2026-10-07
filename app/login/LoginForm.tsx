"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn } from "./actions";
import { FormAlert, SubmitButton } from "@/components/forms";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action] = useActionState(signIn, {});
  return (
    <form className="auth-card" action={action}>
      <h2>Sign in</h2>
      <p className="muted" style={{ margin: "0 0 20px" }}>Use the email and password your firm gave you.</p>
      {notice && !state.error && <div className="notice warn">{notice}</div>}
      <FormAlert state={state} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <SubmitButton className="btn primary block" pendingText="Signing in…">Sign in</SubmitButton>
      <p className="small" style={{ marginTop: 16 }}>
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
    </form>
  );
}
