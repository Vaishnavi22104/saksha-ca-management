import Link from "next/link";
import type { ReactNode } from "react";

/* ---------------------------------------------------------------------------
   Shared visuals for the workflows module.

   Nothing here holds state or uses a hook, so these components work both on
   the server (the gallery, the template page, the run page) and inside the
   client-side template builder, which renders the same StepFlow as a live
   preview while the CA types.
   --------------------------------------------------------------------------- */

export type FlowStep = {
  title: string;
  due_offset_days: number;
  requires_document: boolean;
  requires_review: boolean;
};

/* --- Service glyphs -------------------------------------------------------
   One small icon per kind of service, picked from the service name. Inline
   SVG inherits currentColor, so each glyph follows the colour of its tile. */

type Glyph = "gst" | "tds" | "itr" | "audit" | "roc" | "book" | "generic";

export function serviceGlyph(name?: string | null): Glyph {
  const n = (name ?? "").toLowerCase();
  if (n.includes("gst")) return "gst";
  if (n.includes("tds") || n.includes("tcs")) return "tds";
  if (n.includes("itr") || n.includes("income tax") || n.includes("return")) return "itr";
  if (n.includes("audit")) return "audit";
  if (n.includes("roc") || n.includes("compan") || n.includes("mca")) return "roc";
  if (n.includes("book") || n.includes("account")) return "book";
  return "generic";
}

const GLYPH_PATHS: Record<Glyph, ReactNode> = {
  gst: (
    <>
      <path d="M4 7h16v10H4z" />
      <path d="M8 11h8M8 14h5" />
    </>
  ),
  tds: (
    <>
      <path d="M12 4v16" />
      <path d="M17 8a3.5 3.5 0 0 0-3.5-2.5h-3a2.75 2.75 0 0 0 0 5.5h3a2.75 2.75 0 0 1 0 5.5h-3A3.5 3.5 0 0 1 7 16" />
    </>
  ),
  itr: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
      <path d="M10 13h5M10 16h3" />
    </>
  ),
  audit: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5 21 21" />
      <path d="M8.5 11.5l2 2 3.5-4" />
    </>
  ),
  roc: (
    <>
      <path d="M4 20h16" />
      <path d="M6 20V9l6-4 6 4v11" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  book: (
    <>
      <path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M8 8h6M8 12h6" />
    </>
  ),
  generic: (
    <>
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="17" cy="17" r="2.5" />
      <path d="M7 9.5v5a2.5 2.5 0 0 0 2.5 2.5h5" />
    </>
  ),
};

export function ServiceIcon({ service, size = 22 }: { service?: string | null; size?: number }) {
  return (
    <svg
      className="wf-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPH_PATHS[serviceGlyph(service)]}
    </svg>
  );
}

/* --- Requirement pills ----------------------------------------------------
   The two things a step can ask for. Shown as the same pair of pills
   everywhere, so the CA learns the pattern once. */

export function StepNeeds({ step, compact }: { step: FlowStep; compact?: boolean }) {
  if (!step.requires_document && !step.requires_review) {
    return compact ? null : <span className="wf-need wf-need-none">Plain task</span>;
  }
  return (
    <>
      {step.requires_document && (
        <span className="wf-need wf-need-doc">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" />
          </svg>
          File from client
        </span>
      )}
      {step.requires_review && (
        <span className="wf-need wf-need-rev">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M4 12.5l5 5L20 6.5" />
          </svg>
          CA signs off
        </span>
      )}
    </>
  );
}

/** "On the due date" / "3 days later" — the offset in words, not jargon. */
export function offsetLabel(days: number) {
  if (days === 0) return "Due date";
  if (days === 1) return "+1 day";
  return `+${days} days`;
}

/* --- The step flow --------------------------------------------------------
   A vertical rail with a numbered node per step. This is the picture of the
   template: read top to bottom and you have the whole cycle. */

export function StepFlow(props: {
  steps: FlowStep[];
  /** Marks the first n nodes as finished. Used on the run page. */
  doneUpTo?: number;
  compact?: boolean;
}) {
  const { steps, doneUpTo = 0 } = props;
  if (!steps.length) return null;

  return (
    <ol className={`wf-flow${props.compact ? " wf-flow-compact" : ""}`}>
      {steps.map((s, i) => {
        const done = i < doneUpTo;
        return (
          <li key={i} className={`wf-node${done ? " is-done" : ""}`}>
            <span className="wf-dot" aria-hidden="true">
              {done ? (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M4 12.5l5 5L20 6.5" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <div className="wf-node-b">
              <span className="wf-node-t">{s.title || <em className="wf-ghost">Untitled step</em>}</span>
              <span className="wf-node-m">
                <span className="wf-day">{offsetLabel(s.due_offset_days)}</span>
                <StepNeeds step={s} compact />
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* --- Miniature rail -------------------------------------------------------
   The same information at a glance, for a card in the gallery. Each step is
   one dot, coloured by what it needs. */

export function StepRail({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="wf-rail" role="img" aria-label={`${steps.length} steps`}>
      {steps.map((s, i) => (
        <span
          key={i}
          className={`wf-pip${s.requires_document ? " is-doc" : ""}${s.requires_review ? " is-rev" : ""}`}
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}

/* --- Progress dial --------------------------------------------------------
   One circle, one thick dashed outline. The dash is the finished share of
   the ring and the gap is the rest of it, which draws exactly one arc. */

export function ProgressDial({ done, total, size = 96 }: { done: number; total: number; size?: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className="wf-dial" style={{ width: size, height: size }}>
      <svg viewBox="0 0 80 80" width={size} height={size} role="img" aria-label={`${pct}% complete, ${done} of ${total} tasks`}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={pct === 100 ? "var(--lime-500)" : "var(--accent)"}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <b>{pct}%</b>
    </div>
  );
}

/* --- Counters -------------------------------------------------------------
   Three numbers that describe any template: how long, how much the client
   has to send, how much the CA has to check. */

export function StepCounts({ steps }: { steps: FlowStep[] }) {
  const docs = steps.filter((s) => s.requires_document).length;
  const revs = steps.filter((s) => s.requires_review).length;
  const span = steps.reduce((m, s) => Math.max(m, s.due_offset_days), 0);

  return (
    <div className="wf-counts">
      <span><b>{steps.length}</b> steps</span>
      <span><b>{docs}</b> files</span>
      <span><b>{revs}</b> sign-offs</span>
      <span><b>{span === 0 ? 1 : span + 1}</b> day span</span>
    </div>
  );
}

/* --- Legend ---------------------------------------------------------------
   Explains the dot colours once, at the foot of the gallery, so the cards
   need no captions. */

export function FlowLegend() {
  return (
    <div className="wf-legend">
      <span><i className="wf-pip" /> Plain step</span>
      <span><i className="wf-pip is-doc" /> Needs a file from the client</span>
      <span><i className="wf-pip is-rev" /> Needs the CA to sign off</span>
    </div>
  );
}

/* --- Tiles ----------------------------------------------------------------
   The four numbers across the top of the gallery. */

export function StatTile(props: { label: string; value: ReactNode; hint?: string; tone?: "ink" | "lime" | "violet" }) {
  return (
    <div className={`wf-tile tone-${props.tone ?? "ink"}`}>
      <span className="wf-tile-v">{props.value}</span>
      <span className="wf-tile-l">{props.label}</span>
      {props.hint && <span className="wf-tile-h">{props.hint}</span>}
    </div>
  );
}

/* --- Template card -------------------------------------------------------- */

export function TemplateCard(props: {
  id: string;
  name: string;
  service?: string | null;
  description?: string | null;
  isActive: boolean;
  steps: FlowStep[];
}) {
  const { steps } = props;
  const preview = steps.slice(0, 3);

  return (
    <article className={`wf-card${props.isActive ? "" : " is-archived"}`}>
      {/* An invisible layer that makes the whole card one link. The footer
          buttons sit above it, so they still get their own clicks. */}
      <Link className="wf-card-hit" href={`/workflows/${props.id}`}>
        <span className="sr-only">Open {props.name}</span>
      </Link>

      <header className="wf-card-h">
        <span className={`wf-badge-icon g-${serviceGlyph(props.service)}`}>
          <ServiceIcon service={props.service} />
        </span>
        <div className="wf-card-t">
          <h3>{props.name}</h3>
          <span className="wf-card-s">{props.service ?? "Service"}</span>
        </div>
        {props.isActive ? <span className="wf-live">Active</span> : <span className="badge">Archived</span>}
      </header>

      {props.description && <p className="wf-card-d">{props.description}</p>}

      {steps.length ? (
        <>
          <StepRail steps={steps} />
          <ul className="wf-card-steps">
            {preview.map((s, i) => (
              <li key={i}>
                <span className="wf-card-n">{i + 1}</span>
                {s.title}
              </li>
            ))}
            {steps.length > preview.length && (
              <li className="wf-card-more">+ {steps.length - preview.length} more steps</li>
            )}
          </ul>
        </>
      ) : (
        <p className="wf-card-d wf-ghost">No steps yet — add them to use this template.</p>
      )}

      <footer className="wf-card-f">
        <StepCounts steps={steps} />
        <div className="wf-card-a">
          <Link className="btn sm" href={`/workflows/${props.id}/edit`}>Edit</Link>
          {props.isActive && steps.length > 0 && (
            <Link className="btn sm primary" href={`/workflows/${props.id}#generate`}>Generate</Link>
          )}
        </div>
      </footer>
    </article>
  );
}
