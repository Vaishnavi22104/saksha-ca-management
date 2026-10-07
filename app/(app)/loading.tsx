/**
 * Shown the instant a link is clicked, for as long as the next page is
 * still fetching its rows. Next.js swaps this in synchronously, so a
 * click always produces a visible change straight away instead of a
 * frozen screen — which is what "slow" usually means to the person using
 * the app, even when the data itself arrives quickly.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="page-h">
        <div className="skel skel-title" />
        <div className="skel skel-line" style={{ width: "42%" }} />
      </div>

      <div className="ledger">
        {[0, 1, 2, 3].map((i) => (
          <span key={i}>
            <span className="skel skel-num" />
            <span className="skel skel-line" style={{ width: "70%" }} />
          </span>
        ))}
      </div>

      <div className="panel">
        <div className="panel-h">
          <div className="skel skel-line" style={{ width: 160 }} />
        </div>
        <div className="panel-b">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skel-row">
              <div className="skel skel-line" style={{ width: `${70 - i * 6}%` }} />
              <div className="skel skel-line" style={{ width: 90 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
