import { PageHeader, Panel } from "@/components/ui";
import { TaskTable } from "@/components/TaskTable";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { TaskRow } from "@/lib/types";

export default async function ClientWorkPage() {
  await requireUser(["CLIENT"]);
  const supabase = await createClient();
  // RLS restricts this to the signed-in client's own tasks.
  const { data } = await supabase
    .from("tasks")
    .select("*, service:services(name)")
    .neq("status", "CANCELLED")
    .order("due_date");

  return (
    <>
      <PageHeader title="My work" description="Everything your CA firm is handling for you." />
      <Panel>
        <TaskTable
          tasks={(data ?? []) as unknown as TaskRow[]}
          showClient={false}
          showAssignee={false}
          linkRows={false}
          emptyTitle="No work yet"
          emptyText="Work your CA starts for you will appear here."
        />
      </Panel>
    </>
  );
}
