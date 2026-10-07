import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Pages here depend on the signed-in user, so never cache them statically.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: firm }, { count: unread }] = await Promise.all([
    supabase.from("firms").select("name").eq("id", user.firm_id).maybeSingle(),
    // RLS limits this count to the signed-in user's own notifications.
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("read", false),
  ]);

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
      <Sidebar
        role={user.role}
        firmName={firm?.name ?? ""}
        userName={user.name}
        subtitle={subtitle}
        unread={unread ?? 0}
        avatarUrl={user.avatar_url}
      />
      <main>
        <TopBar userName={user.name} subtitle={subtitle} unread={unread ?? 0} avatarUrl={user.avatar_url} />
        {children}
      </main>
    </div>
  );
}
