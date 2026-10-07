"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Shown when a page throws. The real error stays in the server log; people see a calm message. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="errpage" role="alert">
      <h1 className="serif">Something went wrong</h1>
      <p className="muted">
        This page couldn&apos;t load. Your data is safe. Try again, and if it keeps happening tell your firm.
      </p>
      <div className="btns">
        <button className="btn primary" type="button" onClick={() => reset()}>Try again</button>
        <Link className="btn" href="/dashboard">Go to dashboard</Link>
      </div>
      {error.digest && <p className="ref">Reference: {error.digest}</p>}
    </main>
  );
}
