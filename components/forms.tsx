"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import type { ActionState } from "@/lib/types";

/** Disabled while the form is submitting, preventing double submits. */
export function SubmitButton(props: { children: ReactNode; pendingText?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={props.className ?? "btn primary"} disabled={pending} aria-disabled={pending}>
      {pending ? (props.pendingText ?? "Saving…") : props.children}
    </button>
  );
}

export function Field(props: {
  label: string;
  name: string;
  state?: ActionState;
  hint?: string;
  children: ReactNode;
}) {
  const error = props.state?.fieldErrors?.[props.name];
  return (
    <div className={`field${error ? " invalid" : ""}`}>
      <label htmlFor={`f-${props.name}`}>{props.label}</label>
      {props.children}
      {props.hint && !error && <span className="hint">{props.hint}</span>}
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}

export function FormAlert({ state }: { state?: ActionState }) {
  if (!state) return null;
  if (state.error) return <div className="notice red" role="alert">{state.error}</div>;
  if (state.message) return <div className="notice" role="status">{state.message}</div>;
  return null;
}

export function CredentialsNotice({ state }: { state?: ActionState }) {
  if (!state?.credentials) return null;
  const c = state.credentials;
  return (
    <div className="notice green" role="status">
      <p style={{ marginTop: 0 }}>
        Share these sign-in details with {c.name} yourself, for example by phone. They must set a new password
        the first time they sign in. This password won&apos;t be shown again.
      </p>
      <div className="creds">
        Email: {c.email}
        <br />
        Temporary password: {c.password}
      </div>
    </div>
  );
}
