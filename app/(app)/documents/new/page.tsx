import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RequestForm } from "../RequestForm";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; task?: string }>;
}) {
  await requireUser(["ADMIN", "STAFF"]);
  const { client, task } = await searchParams;
  const supabase = await createClient();

  // RLS already limits both lists to what this user may see.
  const [{ data: clients }, { data: tasks }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("status", "ACTIVE").order("name"),
    supabase
      .from("tasks")
      .select("id, client_id, title, period")
      .not("status", "in", "(COMPLETED,CANCELLED)")
      .order("due_date"),
  ]);

  return (
    <>
      <PageHeader
        crumb={<Link href="/documents">Documents</Link>}
        title="Request a document"
        description="The client sees this in their portal and uploads the file there."
      />
      <RequestForm
        clients={(clients ?? []) as { id: string; name: string }[]}
        tasks={(tasks ?? []) as { id: string; client_id: string; title: string; period: string }[]}
        defaultClientId={client}
        defaultTaskId={task}
      />
    </>
  );
}
