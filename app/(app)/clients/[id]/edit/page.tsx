import Link from "next/link";
import { AccessDenied, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/types";
import { updateClientAction } from "../../actions";
import { ClientForm } from "../../ClientForm";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["ADMIN"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!data) return <AccessDenied />;
  const client = data as Client;

  return (
    <>
      <PageHeader
        crumb={<><Link href="/clients">Clients</Link> / <Link href={`/clients/${id}`}>{client.name}</Link></>}
        title="Edit client"
      />
      <ClientForm action={updateClientAction.bind(null, id)} client={client} submitLabel="Save changes" cancelHref={`/clients/${id}`} />
    </>
  );
}
