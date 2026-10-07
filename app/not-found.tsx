import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ margin: "80px auto", maxWidth: 480, textAlign: "center" }}>
      <h1 className="serif">Page not found</h1>
      <p className="muted">The page you asked for doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link className="btn" href="/dashboard">Go to dashboard</Link>
    </main>
  );
}
