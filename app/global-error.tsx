"use client";

/** Last resort: the root layout itself failed, so this page brings its own <html>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <main style={{ maxWidth: 440, padding: 24, textAlign: "center" }}>
          <h1>SAKSHA is having a problem</h1>
          <p>Please try again in a moment. Your data is safe.</p>
          <button onClick={() => reset()} style={{ padding: "10px 18px", cursor: "pointer" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
