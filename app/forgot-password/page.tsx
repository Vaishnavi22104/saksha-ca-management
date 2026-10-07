import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "Reset password · SAKSHA" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const notice = error === "expired" ? "That reset link has expired or was already used. Request a new one." : undefined;

  return (
    <div className="auth">
      <section className="auth-left">
        <div>
          <Link className="logo" href="/"><Logo size={34} tone="light" /></Link>
          <h1>Locked out? It happens.</h1>
          <p>We&apos;ll email you a private link to set a new password. Your documents and history stay exactly as they were.</p>
        </div>
        <p className="small"><Link href="/" className="backlink">← Back to site</Link></p>
      </section>
      <section className="auth-right">
        <ForgotForm notice={notice} />
      </section>
    </div>
  );
}
