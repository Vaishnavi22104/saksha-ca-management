import { redirect } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui";
import { Pager } from "@/components/Pager";
import { isOutOfRange, pageHref, parsePage, rangeFor } from "@/lib/pagination";
import { ACTIVITY_SELECT, Timeline } from "@/components/Timeline";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Activity } from "@/lib/types";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser(["ADMIN", "STAFF"]);
  const page = parsePage((await searchParams).page);
  const { from, to } = rangeFor(page, 50);
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("activity_logs")
    .select(ACTIVITY_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (isOutOfRange(error)) redirect(pageHref("/activity", {}, 1));

  return (
    <>
      <PageHeader
        title="Activity"
        description={`${user.role === "ADMIN" ? "Everything that has happened in your firm." : "Activity on your assigned clients."} Entries can't be edited or deleted.`}
      />
      <Panel>
        <Timeline entries={(data ?? []) as unknown as Activity[]} viewerRole={user.role} />
        <Pager path="/activity" params={{}} page={page} total={count ?? 0} size={50} />
      </Panel>
    </>
  );
}
