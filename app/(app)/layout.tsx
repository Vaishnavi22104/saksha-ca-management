import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Pages here depend on the signed-in user, so never cache them statically.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: firm } = await supabase.from("firms").select("name").eq("id", user.firm_id).maybeSingle();

  let subtitle = user.role === "ADMIN" ? "CA / Admin" : "Staff";
  if (user.role === "CLIENT") {
    const { data } = await supabase
      .from("client_users")
      .select("client:clients(name)")
      .eq("user_id", user.id)
      .maybeSingle();
    const client = data?.client as unknown as { name: string } | null;
    subtitle = client?.name ?? "Client";
  }

  return (
    <div className="app">
      <Sidebar role={user.role} firmName={firm?.name ?? ""} userName={user.name} subtitle={subtitle} />
      <main>{children}</main>
    </div>
  );
}
