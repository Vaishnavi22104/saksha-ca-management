"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import { TASK_STATUS } from "@/lib/tasks";
import type { TaskStatus } from "@/lib/types";
import { clearChatAction, sendChatAction, type ChatMessage, type ChatState } from "./actions";

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

export interface FirmCounts {
  overdue: number;
  awaitingReview: number;
  documentsAwaited: number;
  activeWorkflows: number;
}

const TOOL_LABEL: Record<string, string> = {
  converse: "Assistant",
  search_tasks: "Task search",
  summarise: "Firm summary",
  draft_reminder: "Reminder draft",
  answer_from_records: "Answered from records",
};

const SUGGESTIONS = [
  "What should I look at first today?",
  "Show me overdue GST work",
  "Which documents am I still waiting for?",
  "How is work spread across the team?",
];

/** The task table that comes back with a search answer. */
function ResultRows({ rows }: { rows: NonNullable<ChatMessage["meta"]>["rows"] }) {
  if (!rows?.length) return null;
  return (
    <div className="table-wrap" style={{ marginTop: 12 }}>
      <table>
        <thead>
          <tr><th>Task</th><th>Client</th><th>Due</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = TASK_STATUS[r.status as TaskStatus];
            return (
              <tr key={r.id}>
                <td className="first">
                  <Link className="rowlink" href={`/tasks/${r.id}`}>{r.title}</Link>
                  <span className="sub">{r.service}, {r.period}{r.assignee ? ` · ${r.assignee}` : ""}</span>
                </td>
                <td>{r.client}</td>
                <td className="nowrap">{formatDate(r.due_date)}</td>
                <td className="nowrap">
                  <span className={`badge ${s?.tone ? "b-" + s.tone : ""}`}>{s?.label ?? r.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One turn. The person's own message is a small bubble on the right; the
 * assistant's answer runs the full width of the column, the way a reply
 * in a chat app does — it is often a table or a draft, and a bubble
 * around those just wastes space.
 */
function Turn({ message }: { message: ChatMessage }) {
  const mine = message.role === "USER";
  const meta = message.meta;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the text is on screen to select by hand.
    }
  };

  if (mine) {
    return (
      <li className="turn mine">
        <div className="said">{message.content}</div>
      </li>
    );
  }

  return (
    <li className="turn theirs">
      <div className="turn-h">
        <span className="who">{message.tool ? TOOL_LABEL[message.tool] ?? message.tool : "Assistant"}</span>
        <button type="button" className="linkbtn copy" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <div className="said">{message.content}</div>
      <ResultRows rows={meta?.rows} />
      {meta?.applied?.length ? <div className="about">Filters: {meta.applied.join(", ")}</div> : null}
      {meta?.dropped?.length ? <div className="about">Ignored as unrecognised: {meta.dropped.join("; ")}</div> : null}
    </li>
  );
}

/**
 * Full-height chat: conversations down the left, the conversation itself
 * filling the rest, and the composer fixed at the bottom. Only the
 * message list scrolls, so the box you type in never moves.
 */
export function AiChat(props: {
  initialMessages: ChatMessage[];
  conversations: ConversationSummary[];
  conversationId?: string;
  counts: FirmCounts;
  provider: string;
  /** A question carried in from the dashboard, ready to send. */
  initialDraft?: string;
}) {
  const [state, formAction, pending] = useActionState(sendChatAction, {
    conversationId: props.conversationId,
  } as ChatState);
  const [clearState, clearAction] = useActionState(clearChatAction, {} as ChatState);

  const [messages, setMessages] = useState<ChatMessage[]>(props.initialMessages);
  const [conversations, setConversations] = useState(props.conversations);
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [draft, setDraft] = useState(props.initialDraft ?? "");
  const [filter, setFilter] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  // Remembers the last turn already added, so an effect that runs twice
  // (React strict mode, or a state change inside it) cannot duplicate it.
  const lastAppended = useRef<string | null>(null);

  /**
   * Clearing the pane has to happen here, not by linking to /ai: when the
   * page is already /ai, Next treats the link as a no-op and this
   * component keeps its state, so the old conversation stays on screen.
   */
  const startNewConversation = () => {
    setMessages([]);
    setConversationId(undefined);
    setDraft("");
    setFilter("");
    lastAppended.current = null;
    router.replace("/ai", { scroll: false });
    inputRef.current?.focus();
  };

  useEffect(() => {
    const turn = state.messages;
    if (!turn?.length) return;
    if (lastAppended.current === turn[0].id) return;
    lastAppended.current = turn[0].id;

    setMessages((current) => [...current, ...turn]);
    setDraft("");

    // A brand-new conversation joins the list straight away.
    if (state.conversationId) {
      setConversationId((current) => {
        if (current === state.conversationId) return current;
        setConversations((list) =>
          list.some((x) => x.id === state.conversationId)
            ? list
            : [
                { id: state.conversationId!, title: turn[0].content.slice(0, 80), updated_at: new Date().toISOString() },
                ...list,
              ],
        );
        return state.conversationId;
      });
    }
  }, [state]);

  useEffect(() => {
    if (!clearState.ok) return;
    setMessages([]);
    setConversations((current) => current.filter((c) => c.id !== conversationId));
    setConversationId(undefined);
  }, [clearState.ok, conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations;
  }, [conversations, filter]);

  // Enter sends, Shift+Enter starts a new line — the convention everywhere.
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (draft.trim().length > 1 && !pending) formRef.current?.requestSubmit();
    }
  };

  const counts = props.counts;

  return (
    <div className="chat-shell">
      <aside className="chat-side">
        <div className="chat-side-h">
          <button type="button" className="btn primary block" onClick={startNewConversation}>
            New conversation
          </button>
          {conversations.length > 4 && (
            <input
              type="search"
              placeholder="Search conversations"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Search conversations"
            />
          )}
        </div>

        <div className="chat-side-list">
          {visible.length ? (
            <ul>
              {visible.map((c) => (
                <li key={c.id} className={c.id === conversationId ? "on" : undefined}>
                  <Link href={`/ai?c=${c.id}`}>
                    <span className="t">{c.title}</span>
                    <span className="d">{formatDate(c.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted" style={{ padding: "4px 14px" }}>
              {conversations.length ? "No conversation matches that." : "Your conversations appear here."}
            </p>
          )}
        </div>

        <div className="chat-side-f small muted">{props.provider}</div>
      </aside>

      <section className="chat-main">
        <header className="chat-main-h">
          <span className="strong">Assistant</span>
          {!!messages.length && (
            <form action={clearAction}>
              <input type="hidden" name="conversation_id" value={conversationId ?? ""} />
              <button
                type="submit"
                className="linkbtn"
                onClick={(e) => {
                  if (!window.confirm("Delete this conversation? This cannot be undone.")) e.preventDefault();
                }}
              >
                Delete conversation
              </button>
            </form>
          )}
        </header>

        <div className="chat-scroll">
          <div className="chat-col">
            {messages.length ? (
              <ol className="turns">
                {messages.map((m) => <Turn key={m.id} message={m} />)}
                {pending && (
                  <li className="turn theirs">
                    <div className="turn-h"><span className="who">Assistant</span></div>
                    <div className="typing"><span /><span /><span /></div>
                  </li>
                )}
              </ol>
            ) : (
              <div className="chat-welcome">
                <h2>What can I help with?</h2>
                <p className="muted">
                  I read your tasks, document requests and workflows — never client files, messages or tax law.
                </p>

                <div className="ledger">
                  <span><span className="n">{counts.overdue}</span><span className="l">Overdue tasks</span></span>
                  <span><span className="n">{counts.awaitingReview}</span><span className="l">Awaiting your review</span></span>
                  <span><span className="n">{counts.documentsAwaited}</span><span className="l">Documents awaited</span></span>
                  <span><span className="n">{counts.activeWorkflows}</span><span className="l">Active workflows</span></span>
                </div>

                <div className="chat-chips">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="btn"
                      onClick={() => {
                        setDraft(s);
                        inputRef.current?.focus();
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {(state.error || clearState.error) && (
          <div className="chat-col">
            <div className="notice red" role="alert">{state.error ?? clearState.error}</div>
          </div>
        )}

        <div className="chat-composer">
          <form ref={formRef} action={formAction} className="chat-col composer-box">
            <input type="hidden" name="conversation_id" value={conversationId ?? ""} />
            <label htmlFor="f-message" className="sr-only">Message</label>
            <textarea
              id="f-message"
              name="message"
              ref={inputRef}
              rows={1}
              maxLength={500}
              placeholder="Ask anything about your clients, tasks or documents…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              required
            />
            <button type="submit" className="btn primary send" disabled={pending || draft.trim().length < 2}>
              {pending ? "…" : "Send"}
            </button>
          </form>
          <p className="chat-col small muted disclaimer">
            Answers come from your own records. Check anything you act on.
          </p>
        </div>
      </section>
    </div>
  );
}
