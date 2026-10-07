import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentFinancialYear, dayKey } from "@/lib/format";
import { TaskForm } from "../TaskForm";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireUser(["ADMIN"]);
  const { client } = await searchParams;
  const supabase = await createClient();

  const [{ data: clients }, { data: services }, { data: assignments }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("status", "ACTIVE").order("name"),
    supabase.from("services").select("id, name").eq("is_active", true).order("name"),
    supabase.from("client_staff").select("client_id, staff:users!client_staff_staff_id_fkey(id, name, is_active)"),
  ]);

  const staffByClient: Record<string, { id: string; name: string }[]> = {};
  type Assignment = { client_id: string; staff: { id: string; name: string; is_active: boolean } | null };
  for (const a of (assignments ?? []) as unknown as Assignment[]) {
    const s = a.staff;
    if (!s?.is_active) continue;
    (staffByClient[a.client_id] ??= []).push({ id: s.id, name: s.name });
  }

  const fy = currentFinancialYear();
  const [y] = fy.split("-").map(Number);
  const prev = `${y - 1}-${String(y % 100).padStart(2, "0")}`;

  return (
    <>
      <PageHeader crumb={<Link href="/tasks">Tasks</Link>} title="New task" description="Fields marked * are required." />
      <TaskForm
        clients={(clients ?? []) as { id: string; name: string }[]}
        services={(services ?? []) as { id: string; name: string }[]}
        staffByClient={staffByClient}
        defaultClientId={client}
        defaultDue={dayKey(Date.now() + 5 * 864e5)}
        financialYears={[fy, prev]}
      />
    </>
  );
}
