"use client";

import { useActionState, useState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/forms";
import { reviewDocumentAction } from "../actions";

/**
 * Accept is one click. Reject opens the reason box, because the database
 * refuses a rejection without a reason.
 */
export function ReviewForm(props: { documentId: string; requestId: string; version: number }) {
  const [state, formAction] = useActionState(reviewDocumentAction, {});
  const [rejecting, setRejecting] = useState(false);

  return (
    <form action={formAction} className="panel-b" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="document_id" value={props.documentId} />
      <input type="hidden" name="request_id" value={props.requestId} />
      <input type="hidden" name="accept" value={rejecting ? "false" : "true"} />

      {rejecting ? (
        <>
          <Field label={`Why is version ${props.version} not usable? *`} name="reason" state={state} hint="The client sees this.">
            <input id="f-reason" name="reason" type="text" placeholder="e.g. Statement is missing the last two pages" required />
          </Field>
          <div className="formfoot">
            <SubmitButton className="btn danger" pendingText="Sending…">Reject and ask again</SubmitButton>
            <button type="button" className="btn" onClick={() => setRejecting(false)}>Back</button>
          </div>
        </>
      ) : (
        <div className="formfoot">
          <SubmitButton pendingText="Saving…">Accept version {props.version}</SubmitButton>
          <button type="button" className="btn" onClick={() => setRejecting(true)}>Reject…</button>
        </div>
      )}
    </form>
  );
}
