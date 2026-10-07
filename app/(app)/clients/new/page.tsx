import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClientAction } from "../actions";
import { ClientForm } from "../ClientForm";

export default async function NewClientPage() {
  await requireUser(["ADMIN"]);
  return (
    <>
      <PageHeader crumb={<Link href="/clients">Clients</Link>} title="Add client" description="Fields marked * are required." />
      <ClientForm action={createClientAction} submitLabel="Add client" cancelHref="/clients" offerLogin />
    </>
  );
}
