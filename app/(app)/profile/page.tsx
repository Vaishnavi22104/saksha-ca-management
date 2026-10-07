import { PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/types";

export default async function ProfilePage() {
  const user = await requireUser(["CLIENT"]);
  const supabase = await createClient();
  const { data } = await supabase.from("client_users").select("client:clients(*)").eq("user_id", user.id).maybeSingle();
  const c = data?.client as unknown as Client | null;

  return (
    <>
      <PageHeader title="Profile" description="To change these details, contact your CA." />
      <div className="narrow">
        <Panel padded>
          {c ? (
            <dl className="info">
              <dt>Business name</dt><dd>{c.name}</dd>
              <dt>Business type</dt><dd>{c.business_type ?? "—"}</dd>
              <dt>Email</dt><dd>{c.email}</dd>
              <dt>Phone</dt><dd>{c.phone ?? "—"}</dd>
              <dt>PAN</dt><dd>{c.pan ?? "—"}</dd>
              <dt>GSTIN</dt><dd>{c.gstin ?? "—"}</dd>
              <dt>Portal login</dt><dd>{user.email}</dd>
            </dl>
          ) : (
            <p className="muted">Your profile could not be loaded.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
