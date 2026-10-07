"use client";

/**
 * Charts – lightweight inline SVG. No chart library required.
 * Hover detail comes from <title>, and every chart carries an aria-label
 * plus a screen-reader table of the same numbers.
 *
 * Colours come only from the tokens in globals.css, and a series keeps
 * its colour by name, so filtering a list never repaints the survivors.
 */

export interface Slice {
  key: string;
  label: string;
  value: number;
  /** A CSS custom property name, e.g. "--brand-600". */
  colour: string;
}

function Numbers({ caption, slices }: { caption: string; slices: Slice[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {slices.map((s) => (
          <tr key={s.key}><th scope="row">{s.label}</th><td>{s.value}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Ring of the status mix, with the total in the hole. Segments are drawn
 * as dashes on one circle, which needs no path maths and stays crisp at
 * any size.
 */
export function Donut({ slices, total, hint }: { slices: Slice[]; total: number; hint: string }) {
  const sum = slices.reduce((n, s) => n + s.value, 0);
  const R = 54;
  const C = 2 * Math.PI * R;
  let used = 0;

  if (!sum) {
    return <p className="muted small" style={{ margin: 0 }}>Nothing open right now.</p>;
  }

  return (
    <div className="chart-donut">
      <svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label={`${hint}. Total ${total}.`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="18" />
        {slices.filter((s) => s.value > 0).map((s) => {
          const length = (s.value / sum) * C;
          const dash = Math.max(0, length - 2);
          const gap = C - dash;
          const offset = -used;
          used += length;
          return (
            <circle
              key={s.key}
              cx="70" cy="70" r={R} fill="none"
              stroke={`var(${s.colour})`} strokeWidth="18"
              strokeDasharray={`${dash.toFixed(2)} ${gap.toFixed(2)}`}
              strokeDashoffset={offset.toFixed(2)}
              transform="rotate(-90 70 70)"
            >
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          );
        })}
        <text x="70" y="66" textAnchor="middle" className="donut-n">{total}</text>
        <text x="70" y="84" textAnchor="middle" className="donut-l">open</text>
      </svg>

      <ul className="legend">
        {slices.filter((s) => s.value > 0).map((s) => (
          <li key={s.key}>
            <i style={{ background: `var(${s.colour})` }} />
            <span className="lg-l">{s.label}</span>
            <span className="lg-n">{s.value}</span>
            <span className="lg-p">{Math.round((s.value / sum) * 100)}%</span>
          </li>
        ))}
      </ul>

      <Numbers caption={hint} slices={slices} />
    </div>
  );
}

/** Horizontal bars with the value labelled at the end of each row. */
export function BarRows({ rows, hint }: { rows: Slice[]; hint: string }) {
  // 18% headroom: without it, a set of equal values all render at 100%
  // and the chart says nothing.
  const max = Math.max(1, ...rows.map((r) => r.value)) * 1.18;
  if (!rows.length) {
    return <p className="muted small" style={{ margin: 0 }}>No work to show yet.</p>;
  }
  return (
    <div className="chart-bars" role="img" aria-label={hint}>
      {rows.map((r) => (
        <div className="bar-row" key={r.key}>
          <span className="bar-l">{r.label}</span>
          <span className="bar-t">
            <i
            style={{ width: `${Math.max(6, (r.value / max) * 100)}%`, background: `var(${r.colour})` }}
            title={`${r.label}: ${r.value}`}
          />
          </span>
          <span className="bar-v">{r.value}</span>
        </div>
      ))}
      <Numbers caption={hint} slices={rows} />
    </div>
  );
}

export interface Point { label: string; value: number }

/**
 * Completions over time: a line with a soft fill, four gridlines and only
 * the endpoints and the peak labelled. Drawn as SVG paths from the points
 * given — no client JavaScript, no chart library.
 */
export function TrendArea({ points, hint, unit = "" }: { points: Point[]; hint: string; unit?: string }) {
  if (points.length < 2) {
    return <p className="muted small" style={{ margin: 0 }}>Not enough history yet to draw a trend.</p>;
  }

  const W = 560, H = 190, PAD_L = 34, PAD_R = 12, PAD_T = 14, PAD_B = 26;
  const max = Math.max(1, ...points.map((p) => p.value));
  const top = Math.ceil(max * 1.2);
  const x = (i: number) => PAD_L + (i * (W - PAD_L - PAD_R)) / (points.length - 1);
  const y = (v: number) => PAD_T + (1 - v / top) * (H - PAD_T - PAD_B);

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const total = points.reduce((n, p) => n + p.value, 0);

  return (
    <div className="chart-trend">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="190" role="img"
        aria-label={`${hint}. ${total} in total, highest ${points[peak].value} in ${points[peak].label}.`}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--lime-500)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--lime-500)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {grid.map((g) => (
          <g key={g}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD_L - 8} y={y(g) + 3.5} textAnchor="end" className="ax">{g}</text>
          </g>
        ))}

        <path d={area} fill="url(#trendFill)" />
        <path d={line} fill="none" stroke="var(--lime-500)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(p.value)} r={i === peak || i === points.length - 1 ? 4.5 : 2.5}
              fill={i === peak || i === points.length - 1 ? "var(--ink)" : "var(--lime-500)"}>
              <title>{`${p.label}: ${p.value}${unit}`}</title>
            </circle>
            {(i === 0 || i === points.length - 1 || i === peak) && (
              <text x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="ax">
                {p.label}
              </text>
            )}
          </g>
        ))}
        <text x={x(peak)} y={y(points[peak].value) - 10} textAnchor="middle" className="pk">{points[peak].value}</text>
      </svg>

      <table className="sr-only">
        <caption>{hint}</caption>
        <tbody>{points.map((p) => <tr key={p.label}><th scope="row">{p.label}</th><td>{p.value}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/**
 * A half-ring showing how far through something you are. The number in
 * the middle is the point; the ring is just the shape of it.
 */
export function Gauge({
  done,
  total,
  caption,
  colour = "--lime-500",
}: {
  done: number;
  total: number;
  caption: string;
  colour?: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const R = 78;
  const HALF = Math.PI * R;               // length of a half circle
  const filled = (pct / 100) * HALF;

  return (
    <div className="gauge">
      <svg viewBox="0 0 200 118" width="100%" height="150" role="img"
        aria-label={`${caption}: ${done} of ${total}, ${pct} per cent`}>
        <path d={`M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`}
          fill="none" stroke="var(--surface-2)" strokeWidth="18" strokeLinecap="round" />
        <path d={`M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`}
          fill="none" stroke={`var(${colour})`} strokeWidth="18" strokeLinecap="round"
          strokeDasharray={`${filled} ${HALF}`} />
        <text x="100" y="86" textAnchor="middle" className="gauge-n">{pct}%</text>
      </svg>
      <p className="gauge-c">{caption}</p>
      <p className="gauge-s">{done} of {total} finished</p>
    </div>
  );
}
