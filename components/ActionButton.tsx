"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/types";
import { SubmitButton } from "@/components/forms";

/**
 * A one-button form that calls a server action and shows its error inline.
 * `confirmText` asks the browser to confirm before submitting.
 */
export function ActionButton(props: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  className?: string;
  confirmText?: string;
}) {
  const [state, formAction] = useActionState(props.action, {});
  return (
    <form
      action={formAction}
      className="inline-form"
      onSubmit={(e) => {
        if (props.confirmText && !window.confirm(props.confirmText)) e.preventDefault();
      }}
    >
      {Object.entries(props.fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton className={props.className ?? "btn"} pendingText="Working…">{props.label}</SubmitButton>
      {state.error && <span className="err small" role="alert" style={{ color: "var(--danger)", display: "block" }}>{state.error}</span>}
    </form>
  );
}
