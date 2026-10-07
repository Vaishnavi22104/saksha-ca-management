/**
 * SAKSHA's mark.
 *
 * साक्षी means witness — the app's whole promise is that every change is
 * on the record. So the mark is a tick whose tail becomes a ruled line:
 * the work is checked, and the checking is written down. Near-black
 * plate, lime stroke, one shape, no gradient, legible at 16px.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label="SAKSHA"
      className="logo-mark"
    >
      <rect width="40" height="40" rx="11" fill="var(--ink)" />
      {/* The ledger rules the tick is written on. */}
      <path d="M9 27.5h22" stroke="var(--lime-500)" strokeWidth="2" strokeLinecap="round" opacity=".38" />
      <path d="M9 31.5h13" stroke="var(--lime-500)" strokeWidth="2" strokeLinecap="round" opacity=".18" />
      {/* The tick itself. */}
      <path
        d="M11 19.2 16.8 25 30 9.5"
        stroke="var(--lime-500)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark plus wordmark, for headers and the sign-in page. */
export function Logo({ size = 30, tone = "dark" }: { size?: number; tone?: "dark" | "light" }) {
  return (
    <span className={`logo ${tone}`}>
      <LogoMark size={size} />
      <b>SAKSHA</b>
    </span>
  );
}
