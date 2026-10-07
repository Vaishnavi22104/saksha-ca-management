"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MESSAGE_MAX } from "@/lib/messages";
import { sendMessageAction } from "./actions";

type TaskOption = { id: string; title: string; period: string };

/**
 * The composer at the foot of a conversation: one rounded box, a round
 * send button, Enter to send and Shift+Enter for a new line. The
 * optional "about this task" picker stays tucked away until it is asked
 * for, so the bar looks like a message bar and not a form.
 */
export function MessageForm(props: { clientId: string; tasks: TaskOption[]; defaultTaskId?: string }) {
  const [state, formAction, pending] = useActionState(sendMessageAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [taskId, setTaskId] = useState(props.defaultTaskId ?? "");
  const [linking, setLinking] = useState(Boolean(props.defaultTaskId));

  // Clear the box once the message is away, so it cannot be sent twice.
  useEffect(() => {
    if (!state.ok) return;
    setDraft("");
    formRef.current?.reset();
    boxRef.current?.focus();
  }, [state.ok]);

  // Grow with the text, up to a few lines.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 132)}px`;
  }, [draft]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (draft.trim() && !pending) formRef.current?.requestSubmit();
    }
  };

  const chosen = props.tasks.find((t) => t.id === taskId);

  return (
    <div className="wa-composer">
      {state.error && <div className="notice red" role="alert">{state.error}</div>}
      {state.fieldErrors?.message && <div className="notice red" role="alert">{state.fieldErrors.message}</div>}

      {linking && props.tasks.length > 0 && (
        <div className="wa-link">
          <label className="small">
            About:{" "}
            <select name="task_id" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Nothing in particular</option>
              {props.tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title} ({t.period})</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="linkbtn"
            onClick={() => { setLinking(false); setTaskId(""); }}
          >
            Remove
          </button>
        </div>
      )}

      <form ref={formRef} action={formAction} className="wa-bar" noValidate>
        <input type="hidden" name="client_id" value={props.clientId} />
        {!linking && <input type="hidden" name="task_id" value="" />}
        {linking && <input type="hidden" name="task_id" value={taskId} />}

        {props.tasks.length > 0 && !linking && (
          <button
            type="button"
            className="wa-attach"
            onClick={() => setLinking(true)}
            title="Link this message to a task"
            aria-label="Link this message to a task"
          >
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}

        <label htmlFor="f-message" className="sr-only">Message</label>
        <textarea
          id="f-message"
          name="message"
          ref={boxRef}
          rows={1}
          maxLength={MESSAGE_MAX}
          placeholder={chosen ? `Message about ${chosen.title}…` : "Type a message"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          required
        />

        <button type="submit" className="wa-send" disabled={pending || !draft.trim()} aria-label="Send message">
          {pending ? (
            <span className="wa-sending" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4.5 12h14M13 6.5 18.5 12 13 17.5" />
            </svg>
          )}
        </button>
      </form>
      <p className="wa-hint small muted">Enter sends · Shift + Enter for a new line · files go through Documents</p>
    </div>
  );
}
