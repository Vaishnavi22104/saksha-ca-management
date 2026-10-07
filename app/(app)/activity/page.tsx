import { PageHeader, Panel } from "@/components/ui";
import { ACTIVITY_SELECT, Timeline } from "@/components/Timeline";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Activity } from "@/lib/types";

export default async function ActivityPage() {
  const user = await requireUser(["ADMIN", "STAFF"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_logs")
    .select(ACTIVITY_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <>
      <PageHeader
        title="Activity"
        description={`${user.role === "ADMIN" ? "Everything that has happened in your firm." : "Activity on your assigned clients."} Entries can't be edited or deleted.`}
      />
      <Panel>
        <Timeline entries={(data ?? []) as unknown as Activity[]} viewerRole={user.role} />
      </Panel>
    </>
  );
}
