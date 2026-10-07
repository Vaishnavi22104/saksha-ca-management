import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const notice =
    reason === "inactive" ? "This account is inactive. Contact your CA firm."
    : reason === "signedout" ? "You have been signed out."
    : undefined;

  return (
    <div className="auth">
      <section className="auth-left">
        <div>
          <Link className="logo" href="/"><Logo size={34} tone="light" /></Link>
          <h1>Run your whole CA practice on one screen.</h1>
          <p>Less chasing. More filing. Every GST, ITR and TDS cycle created for you, documents collected in the client&apos;s own portal, every change on record. Professional decisions stay with the CA.</p>
          <ul className="flow">
            <li>Client added and given a portal login</li>
            <li>Staff assigned to the client</li>
            <li>Work moves from to-do through CA review</li>
            <li>Every change recorded in the activity log</li>
          </ul>
        </div>
        <p className="small"><Link href="/" className="backlink">← Back to site</Link></p>
      </section>
      <section className="auth-right">
        {/* Always reachable, whatever the height of the panel beside it. */}
        <Link className="btn back-btn" href="/">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Back to site
        </Link>
        <LoginForm notice={notice} />
      </section>
    </div>
  );
}
