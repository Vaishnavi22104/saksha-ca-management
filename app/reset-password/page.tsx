import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";
import { ResetForm } from "./ResetForm";

export const metadata = { title: "New password · SAKSHA" };

export default async function ResetPasswordPage() {
  // The emailed link signs the person in briefly; without it there is nothing to reset.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=expired");

  return (
    <div className="auth">
      <section className="auth-left">
        <div>
          <Link className="logo" href="/"><Logo size={34} tone="light" /></Link>
          <h1>Almost done.</h1>
          <p>Pick a password you haven&apos;t used elsewhere. You&apos;ll sign in with it straight after.</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="linkbtn" type="submit">Cancel and sign out</button>
        </form>
      </section>
      <section className="auth-right">
        <ResetForm email={user.email ?? ""} />
      </section>
    </div>
  );
}
