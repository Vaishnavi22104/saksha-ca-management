"use client";

import { useActionState } from "react";
import { FormAlert, SubmitButton } from "@/components/forms";
import { setEmailPrefAction } from "./email-actions";

export function EmailPrefs({ enabled }: { enabled: boolean }) {
  const [state, action] = useActionState(setEmailPrefAction, {});
  return (
    <form action={action} className="panel" style={{ padding: 20, marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Email notifications</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        A short daily email about new tasks, requested documents, messages and anything due soon.
        Notifications inside SAKSHA are always on.
      </p>
      <FormAlert state={state} />
      <label className="check" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <input type="checkbox" name="enabled" defaultChecked={enabled} /> Email me my updates
      </label>
      <SubmitButton className="btn">Save</SubmitButton>
    </form>
  );
}
