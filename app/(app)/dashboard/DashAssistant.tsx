"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Orb } from "@/components/Orb";
import { sendChatAction, type ChatMessage, type ChatState } from "../ai/actions";

const SUGGESTIONS = [
  { label: "Daily summary", ask: "What should I look at first today?" },
  { label: "Missing documents", ask: "Which documents am I still waiting for?" },
  { label: "Team workload", ask: "How is work spread across the team?" },
  { label: "Overdue GST", ask: "Show me overdue GST work" },
];

/**
 * The assistant, answering on the dashboard itself. It writes to the same
 * conversation store as the full page, so anything asked here is waiting
 * under "AI assistant" in the sidebar — this card is the quick question,
 * that page is the history.
 */
export function DashAssistant() {
  const [state, formAction, pending] = useActionState(sendChatAction, {} as ChatState);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [draft, setDraft] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Guards against the same turn being appended twice if the effect reruns.
  const lastAppended = useRef<string | null>(null);

  useEffect(() => {
    const turn = state.messages;
    if (!turn?.length) return;
    if (lastAppended.current === turn[0].id) return;
    lastAppended.current = turn[0].id;
    setMessages((current) => [...current, ...turn]);
    setDraft("");
    if (state.conversationId) setConversationId(state.conversationId);
  }, [state]);

  useEffect(() => {
    if (messages.length || pending) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  /** A chip fills the box and sends it in one go. */
  const askNow = (question: string) => {
    setDraft(question);
    // The value has to be in the DOM before the form is submitted.
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  };

  const clear = () => {
    setMessages([]);
    setConversationId(undefined);
    setDraft("");
    lastAppended.current = null;
    inputRef.current?.focus();
  };

  const started = messages.length > 0 || pending;

  return (
    <>
      <div className="ai-card-h">
        <span className="ai-tag">SAKSHA Assistant</span>
        {started && (
          <span className="ai-card-a">
            <button type="button" className="ai-mini" onClick={clear}>New</button>
            <Link className="ai-mini" href={conversationId ? `/ai?c=${conversationId}` : "/ai"}>
              Open full
            </Link>
          </span>
        )}
      </div>

      {!started ? (
        <>
          <Orb />
          <p className="ai-ask">Ask anything about your firm&apos;s work.</p>
          <div className="ai-btns">
            {SUGGESTIONS.map((s) => (
              <button key={s.label} type="button" className="ai-btn" onClick={() => askNow(s.ask)}>
                {s.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="ai-thread">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "USER" ? "ai-t mine" : "ai-t theirs"}>
              <p>{m.content}</p>
              {m.role === "ASSISTANT" && !!m.meta?.rows?.length && (
                <ul className="ai-rows">
                  {m.meta.rows.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      <Link href={`/tasks/${r.id}`}>{r.title}</Link>
                      <span>{r.client}</span>
                    </li>
                  ))}
                  {m.meta.rows.length > 5 && (
                    <li className="ai-more">
                      <Link href={conversationId ? `/ai?c=${conversationId}` : "/ai"}>
                        {m.meta.rows.length - 5} more — open the assistant
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </div>
          ))}
          {pending && (
            <div className="ai-t theirs">
              <span className="ai-dots" aria-label="Thinking"><i /><i /><i /></span>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {state.error && <p className="ai-err" role="alert">{state.error}</p>}

      <form ref={formRef} action={formAction} className="ai-input">
        <input type="hidden" name="conversation_id" value={conversationId ?? ""} />
        <label htmlFor="dash-ask" className="sr-only">Ask the assistant</label>
        <input
          id="dash-ask"
          name="message"
          ref={inputRef}
          type="text"
          placeholder="Ask anything…"
          autoComplete="off"
          maxLength={500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" aria-label="Ask" disabled={pending || draft.trim().length < 2}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m3 11 18-8-8 18-2-7-8-3Z" />
          </svg>
        </button>
      </form>
    </>
  );
}
