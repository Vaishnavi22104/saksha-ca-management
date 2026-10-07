import Link from "next/link";
import { AccessDenied, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_SELECT, sortSteps } from "@/lib/workflows";
import type { WorkflowTemplateRow } from "@/lib/types";
import { TemplateForm } from "../../TemplateForm";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["ADMIN"]);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data }, { data: services }] = await Promise.all([
    supabase.from("workflow_templates").select(TEMPLATE_SELECT).eq("id", id).maybeSingle(),
    supabase.from("services").select("id, name").eq("is_active", true).order("name"),
  ]);
  if (!data) return <AccessDenied />;
  const template = data as unknown as WorkflowTemplateRow;

  return (
    <>
      <PageHeader
        crumb={<Link href={`/workflows/${id}`}>{template.name}</Link>}
        title="Edit template"
        description="Workflows already generated keep the steps they were created with."
      />
      <TemplateForm
        services={(services ?? []) as { id: string; name: string }[]}
        template={{
          id: template.id,
          name: template.name,
          service_id: template.service_id,
          description: template.description,
          steps: sortSteps(template.steps ?? []),
        }}
      />
    </>
  );
}
