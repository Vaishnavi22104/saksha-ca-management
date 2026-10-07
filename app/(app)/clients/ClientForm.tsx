"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CredentialsNotice, Field, FormAlert, SubmitButton } from "@/components/forms";
import { BUSINESS_TYPES } from "@/lib/validation";
import type { ActionState, Client } from "@/lib/types";

type State = ActionState & { clientId?: string };

export function ClientForm(props: {
  action: (prev: State, formData: FormData) => Promise<State>;
  client?: Client;
  submitLabel: string;
  cancelHref: string;
  offerLogin?: boolean;
}) {
  const [state, formAction] = useActionState(props.action, {});
  const c = props.client;

  if (state.ok && state.credentials) {
    return (
      <div className="panel panel-b narrow">
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Client added</h2>
        <CredentialsNotice state={state} />
        <p className="small muted">Share these details with the client directly. They will be asked to set their own password at first sign-in.</p>
        <Link className="btn primary" href={`/clients/${state.clientId}`}>Open client</Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="panel panel-b narrow" noValidate>
      <FormAlert state={state} />
      {state.clientId && (
        <p><Link href={`/clients/${state.clientId}`}>Open the client that was created</Link></p>
      )}
      <Field label="Client name *" name="name" state={state}>
        <input id="f-name" name="name" type="text" defaultValue={c?.name} required />
      </Field>
      <div className="fields2">
        <Field label="Email *" name="email" state={state}>
          <input id="f-email" name="email" type="email" defaultValue={c?.email} required />
        </Field>
        <Field label="Phone" name="phone" state={state}>
          <input id="f-phone" name="phone" type="text" inputMode="tel" defaultValue={c?.phone ?? ""} />
        </Field>
        <Field label="PAN" name="pan" state={state}>
          <input id="f-pan" name="pan" type="text" maxLength={10} className="uppercase" defaultValue={c?.pan ?? ""} />
        </Field>
        <Field label="GSTIN" name="gstin" state={state}>
          <input id="f-gstin" name="gstin" type="text" maxLength={15} className="uppercase" defaultValue={c?.gstin ?? ""} />
        </Field>
      </div>
      <Field label="Business type" name="business_type" state={state}>
        <select id="f-business_type" name="business_type" defaultValue={c?.business_type ?? "Proprietorship"}>
          {BUSINESS_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      {props.offerLogin && (
        <p>
          <label className="check">
            <input type="checkbox" name="create_login" defaultChecked /> Create a portal login for this client
          </label>
        </p>
      )}
      <div className="formfoot">
        <Link className="btn" href={props.cancelHref}>Cancel</Link>
        <SubmitButton>{props.submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
