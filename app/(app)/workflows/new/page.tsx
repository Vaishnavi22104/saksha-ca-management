import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TemplateForm } from "../TemplateForm";

export default async function NewTemplatePage() {
  await requireUser(["ADMIN"]);
  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <>
      <PageHeader
        crumb={<Link href="/workflows">Workflows</Link>}
        title="New workflow template"
        description="Pick an outline or start blank, then list the steps in the order your firm does them. The preview on the right shows what your team will see."
      />
      <TemplateForm services={(services ?? []) as { id: string; name: string }[]} />
    </>
  );
}
