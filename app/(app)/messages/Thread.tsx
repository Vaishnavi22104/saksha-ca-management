import Link from "next/link";
import { dayDivider, dayKey, formatTime } from "@/lib/format";
import { isFromFirm, senderLabel } from "@/lib/messages";
import type { AppUser, Message } from "@/lib/types";

/**
 * The conversation, oldest first, with a date divider above the first
 * message of each day. The firm's messages sit on the right, the
 * client's on the left, so who said what is obvious at a glance.
 */
export function Thread(props: { messages: Message[]; user: AppUser; linkTasks?: boolean }) {
  if (!props.messages.length) {
    return (
      <div className="wa-empty">
        <span className="wa-empty-i" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
          </svg>
        </span>
        <p className="strong">No messages yet</p>
        <p className="muted small">
          {props.user.role === "CLIENT"
            ? "Ask your CA firm anything about your work. Type below to start."
            : "Say hello — the client sees this in their portal straight away."}
        </p>
      </div>
    );
  }

  let lastDay = "";

  return (
    <ol className="wa-thread">
      {props.messages.map((m) => {
        const mine = m.sender_id === props.user.id;
        const firmSide = isFromFirm(m.sender?.role);
        // The firm always reads on the right, whoever in the firm wrote it.
        const right = props.user.role === "CLIENT" ? mine : firmSide;
        const day = dayKey(m.created_at);
        const newDay = day !== lastDay;
        lastDay = day;

        return (
          <li key={m.id} className={right ? "out" : "in"}>
            {newDay && <span className="wa-day" aria-hidden="true">{dayDivider(m.created_at)}</span>}
            <div className="wa-bubble">
              {!right && <span className="wa-from">{senderLabel(m.sender, props.user.id, props.user.role)}</span>}
              {right && !mine && props.user.role !== "CLIENT" && (
                <span className="wa-from">{senderLabel(m.sender, props.user.id, props.user.role)}</span>
              )}
              <p>{m.message}</p>
              {m.task && (
                <span className="wa-about">
                  About{" "}
                  {props.linkTasks ? <Link href={`/tasks/${m.task.id}`}>{m.task.title}</Link> : m.task.title}
                </span>
              )}
              <span className="wa-time">
                <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
                {right && <span className="wa-tick" aria-hidden="true">✓✓</span>}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
