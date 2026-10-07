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
          <p className="logo">CA Office OS</p>
          <h1>The state of your office, in one place.</h1>
          <p>Clients, recurring work, staff and deadlines for small CA firms. Professional decisions stay with the CA.</p>
          <ul className="flow">
            <li>Client added and given a portal login</li>
            <li>Staff assigned to the client</li>
            <li>Work moves from to-do through CA review</li>
            <li>Every change recorded in the activity log</li>
          </ul>
        </div>
        <p className="small">Work-in-progress build · foundation phase</p>
      </section>
      <section className="auth-right">
        <LoginForm notice={notice} />
      </section>
    </div>
  );
}
