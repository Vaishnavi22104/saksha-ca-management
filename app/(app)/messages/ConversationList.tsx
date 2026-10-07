"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { chatStamp } from "@/lib/format";

export interface Conversation {
  id: string;
  name: string;
  /** Preview of the most recent message, if there is one. */
  text?: string;
  /** Who wrote it — decides the "You:" prefix and the tick. */
  fromFirm?: boolean;
  at?: string;
  /** The client wrote last, so the firm still owes a reply. */
  awaiting?: boolean;
  /** Where the row goes. Defaults to this client's thread. */
  href?: string;
  /** Name the round avatar takes its initials from, when it differs. */
  avatarName?: string;
}

/** Up to two initials, for the round avatar. */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** A stable tint per name, so the same client always looks the same. */
export function avatarTone(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 997;
  return h % 4;
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span
      className={`wa-av t${avatarTone(name)}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/**
 * The chat list, exactly as a messaging app arranges it: a search box,
 * then one row per person — avatar, name, the last thing said, and when.
 * Tapping a row opens that conversation beside it (or, on a phone, in
 * place of the list).
 */
export function ConversationList({
  items,
  heading,
  activeId,
}: {
  items: Conversation[];
  heading: string;
  /** Forced open row, for a portal where the thread is not on its own URL. */
  activeId?: string;
}) {
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const openId = activeId ?? (pathname.startsWith("/messages/") ? pathname.split("/")[2] : undefined);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // Names first, then anything said in the conversation.
    return items.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.text ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const waiting = items.filter((c) => c.awaiting).length;

  return (
    <aside className="wa-side">
      <div className="wa-side-h">
        <div className="wa-side-t">
          <h2>{heading}</h2>
          {waiting > 0 && <span className="wa-count">{waiting} waiting</span>}
        </div>
        <div className="wa-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            aria-label="Search conversations by name"
          />
          {query && (
            <button type="button" className="wa-clear" onClick={() => setQuery("")} aria-label="Clear search">
              ×
            </button>
          )}
        </div>
      </div>

      <div className="wa-list">
        {visible.length ? (
          <ul>
            {visible.map((c) => (
              <li key={c.id} className={c.id === openId ? "on" : undefined}>
                <Link href={c.href ?? `/messages/${c.id}`}>
                  <Avatar name={c.avatarName ?? c.name} />
                  <span className="wa-row">
                    <span className="wa-row-1">
                      <b>{c.name}</b>
                      {c.at && <time dateTime={c.at}>{chatStamp(c.at)}</time>}
                    </span>
                    <span className="wa-row-2">
                      <span className="wa-prev">
                        {c.text ? (
                          <>
                            {c.fromFirm && <span className="wa-tick" aria-hidden="true">✓✓</span>}
                            {c.text}
                          </>
                        ) : (
                          <i>No messages yet</i>
                        )}
                      </span>
                      {c.awaiting && <span className="wa-dot" title="Waiting on a reply from you" />}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="wa-none small muted">
            {items.length ? `No one matches “${query}”.` : "Your conversations will appear here."}
          </p>
        )}
      </div>
    </aside>
  );
}
