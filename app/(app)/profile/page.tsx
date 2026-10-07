import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";
import { ChangePasswordSection } from "./ChangePasswordSection";
import type { Client } from "@/lib/types";

export default async function ProfilePage() {
  const user = await requireUser(); // all roles allowed

  const supabase = await createClient();

  // Fetch the firm name for display.
  const { data: firm } = await supabase
    .from("firms")
    .select("name")
    .eq("id", user.firm_id)
    .maybeSingle();

  // For CLIENT users, also load their linked client/business details.
  let client: Client | null = null;
  if (user.role === "CLIENT") {
    const { data } = await supabase
      .from("client_users")
      .select("client:clients(*)")
      .eq("user_id", user.id)
      .maybeSingle();
    client = (data?.client as unknown as Client) ?? null;
  }

  return (
    <>
      <PageHeader title="Profile" description="Manage your account details and preferences." />
      <ProfileForm user={user} client={client} firmName={firm?.name ?? "—"} />
      <div className="narrow" style={{ marginTop: 0 }}>
        <ChangePasswordSection />
      </div>
    </>
  );
}
