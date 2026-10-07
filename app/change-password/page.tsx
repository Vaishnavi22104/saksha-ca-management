import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_active) redirect("/auth/signout?reason=inactive");
  if (!user.must_change_password) redirect("/dashboard");

  return (
    <div className="auth">
      <section className="auth-left">
        <div>
          <p className="logo">SAKSHA</p>
          <h1>Set your own password.</h1>
          <p>Your firm created this account with a temporary password. Replace it before you continue.</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="linkbtn" type="submit">Sign out</button>
        </form>
      </section>
      <section className="auth-right">
        <ChangePasswordForm email={user.email} />
      </section>
    </div>
  );
}
