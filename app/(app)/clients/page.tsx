import Link from "next/link";
import { ClientStatusBadge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { plural } from "@/lib/format";
import { isOpen, isOverdue } from "@/lib/tasks";
import type { Client, Task } from "@/lib/types";

type Row = Client & { client_staff: { staff: { name: string } | null }[] };

/** Strips characters that have meaning in PostgREST filter syntax. */
const cleanSearch = (q: string) => q.replace(/[,()%*\\]/g, " ").trim().slice(0, 80);

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireUser(["ADMIN", "STAFF"]);
  const sp = await searchParams;
  const q = cleanSearch(sp.q ?? "");
  const status = sp.status === undefined ? "ACTIVE" : sp.status;

  const supabase = await createClient();
  let query = supabase
    .from("clients")
    .select("*, client_staff(staff:users!client_staff_staff_id_fkey(name))")
    .order("name");
  if (status === "ACTIVE" || status === "INACTIVE") query = query.eq("status", status);
  if (q) query = query.or(`name.ilike.%${q}%,gstin.ilike.%${q}%,pan.ilike.%${q}%,email.ilike.%${q}%`);

  const [{ data }, { data: taskData }] = await Promise.all([
    query,
    supabase.from("tasks").select("client_id, status, due_date"),
  ]);
  const clients = (data ?? []) as unknown as Row[];
  const tasks = (taskData ?? []) as Pick<Task, "client_id" | "status" | "due_date">[];
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Clients"
        description={user.role === "ADMIN" ? "All clients of your firm." : "Clients assigned to you."}
        actions={user.role === "ADMIN" && <Link className="btn primary" href="/clients/new">Add client</Link>}
      />
      <Panel>
        <form className="filters" method="get">
          <label className="sr-only" htmlFor="q">Search clients</label>
          <input id="q" name="q" type="search" placeholder="Search name, GSTIN, PAN or email" defaultValue={q} />
          <label className="sr-only" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="">All statuses</option>
          </select>
          <button className="btn sm" type="submit">Apply</button>
          <span className="muted small">{plural(clients.length, "client", "clients")}</span>
        </form>
        {clients.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Client</th><th>GSTIN</th><th>Assigned staff</th><th>Open tasks</th><th>Status</th></tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const open = tasks.filter((t) => t.client_id === c.id && isOpen(t));
                  const overdue = open.filter((t) => isOverdue(t, now)).length;
                  const staff = c.client_staff.map((s) => s.staff?.name.split(" ")[0]).filter(Boolean);
                  return (
                    <tr key={c.id}>
                      <td className="first">
                        <Link className="rowlink" href={`/clients/${c.id}`}>{c.name}</Link>
                        <span className="sub">{c.business_type}</span>
                      </td>
                      <td className="nowrap">{c.gstin ?? <span className="muted">—</span>}</td>
                      <td>{staff.length ? staff.join(", ") : <span className="muted">None</span>}</td>
                      <td>
                        {open.length}
                        {overdue > 0 && <> <span className="badge b-red">{overdue} overdue</span></>}
                      </td>
                      <td><ClientStatusBadge status={c.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={q || status !== "ACTIVE" ? "No clients match" : "No clients yet"}>
            {q || status !== "ACTIVE"
              ? "Try a different search or status."
              : user.role === "ADMIN" ? "Add your first client to begin." : "Your CA will assign clients to you."}
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
