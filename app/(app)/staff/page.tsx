import { ActionButton } from "@/components/ActionButton";
import { PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isOpen } from "@/lib/tasks";
import type { AppUser, TaskStatus } from "@/lib/types";
import { setStaffActiveAction } from "./actions";
import { AddStaffForm } from "./AddStaffForm";

type StaffRow = AppUser & { client_staff: { client: { name: string } | null }[] };

export default async function StaffPage() {
  await requireUser(["ADMIN"]);
  const supabase = await createClient();
  const [{ data }, { data: taskData }] = await Promise.all([
    supabase
      .from("users")
      .select("*, client_staff!client_staff_staff_id_fkey(client:clients(name))")
      .eq("role", "STAFF")
      .order("is_active", { ascending: false })
      .order("name"),
    supabase.from("tasks").select("assigned_to, status"),
  ]);
  const staff = (data ?? []) as unknown as StaffRow[];
  const tasks = (taskData ?? []) as { assigned_to: string | null; status: TaskStatus }[];

  return (
    <>
      <PageHeader title="Staff" description="People in your firm and the clients they handle." />
      <div className="stack">
        <Panel>
          {staff.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>Clients</th><th>Open tasks</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {staff.map((s) => {
                    const clients = s.client_staff.map((c) => c.client?.name).filter(Boolean);
                    const open = tasks.filter((t) => t.assigned_to === s.id && isOpen(t)).length;
                    return (
                      <tr key={s.id}>
                        <td className="first">
                          <span className="strong">{s.name}</span>
                          <span className="sub">{s.email}{s.must_change_password ? " · temporary password" : ""}</span>
                        </td>
                        <td>{clients.length ? clients.join(", ") : <span className="muted">None</span>}</td>
                        <td>{open}</td>
                        <td>{s.is_active ? <span className="badge b-green">Active</span> : <span className="badge">Inactive</span>}</td>
                        <td className="right">
                          {s.is_active ? (
                            <ActionButton
                              action={setStaffActiveAction}
                              fields={{ user_id: s.id, active: "false" }}
                              label="Deactivate"
                              className="btn sm danger"
                              confirmText={`Deactivate ${s.name}? They won't be able to sign in.${open ? ` Their ${open} open task(s) stay assigned until you reassign them.` : ""}`}
                            />
                          ) : (
                            <ActionButton action={setStaffActiveAction} fields={{ user_id: s.id, active: "true" }} label="Reactivate" className="btn sm" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty"><b>No staff yet</b>Add your first team member below.</div>
          )}
        </Panel>
        <Panel title="Add staff member">
          <AddStaffForm />
        </Panel>
        <p className="small muted">Deactivated staff can&apos;t sign in. Their completed work and history stay attributed to them.</p>
      </div>
    </>
  );
}
