import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { ACTIVITY_SELECT, Timeline } from "@/components/Timeline";
import { TaskTable } from "@/components/TaskTable";
import { AccessDenied, ClientStatusBadge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TASK_SELECT } from "@/lib/tasks";
import type { Activity, Client, TaskRow } from "@/lib/types";
import { setClientActiveAction, unassignStaffAction } from "../actions";
import { AssignStaffForm } from "./AssignStaffForm";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["ADMIN", "STAFF"]);
  const { id } = await params;
  const supabase = await createClient();

  // RLS returns nothing for clients this user may not see: that looks exactly like "not found".
  const { data: clientData } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!clientData) return <AccessDenied />;
  const client = clientData as Client;
  const admin = user.role === "ADMIN";

  const [{ data: staffData }, { data: taskData }, { data: activityData }, { data: loginData }, { data: firmStaff }] =
    await Promise.all([
      supabase.from("client_staff").select("staff:users!client_staff_staff_id_fkey(id, name, is_active)").eq("client_id", id),
      supabase.from("tasks").select(TASK_SELECT).eq("client_id", id),
      supabase.from("activity_logs").select(ACTIVITY_SELECT).eq("client_id", id).order("created_at", { ascending: false }).limit(15),
      admin
        ? supabase.from("client_users").select("user:users(email, is_active, must_change_password)").eq("client_id", id)
        : Promise.resolve({ data: null }),
      admin
        ? supabase.from("users").select("id, name").eq("role", "STAFF").eq("is_active", true).order("name")
        : Promise.resolve({ data: null }),
    ]);

  type StaffRef = { id: string; name: string; is_active: boolean };
  const staff = ((staffData ?? []) as unknown as { staff: StaffRef | null }[])
    .map((r) => r.staff)
    .filter((s): s is StaffRef => !!s);
  const tasks = (taskData ?? []) as unknown as TaskRow[];
  const services = [...new Set(tasks.map((t) => t.service?.name).filter(Boolean))];
  const login = (loginData ?? [])[0]?.user as unknown as { email: string; is_active: boolean; must_change_password: boolean } | undefined;
  const available = ((firmStaff ?? []) as { id: string; name: string }[]).filter((s) => !staff.some((a) => a.id === s.id));
  const active = client.status === "ACTIVE";

  return (
    <>
      <PageHeader
        crumb={<Link href="/clients">Clients</Link>}
        title={client.name}
        description={<><ClientStatusBadge status={client.status} /> <span className="muted">{client.business_type}</span></>}
        actions={
          admin && (
            <>
              <Link className="btn" href={`/clients/${id}/edit`}>Edit details</Link>
              {active ? (
                <ActionButton
                  action={setClientActiveAction}
                  fields={{ client_id: id, active: "false" }}
                  label="Deactivate"
                  className="btn danger"
                  confirmText={`Deactivate ${client.name}? Their portal login will stop working. History is kept and you can reactivate later.`}
                />
              ) : (
                <ActionButton action={setClientActiveAction} fields={{ client_id: id, active: "true" }} label="Reactivate" />
              )}
            </>
          )
        }
      />
      {!active && (
        <div className="notice warn">This client is inactive. Their portal login is disabled and their history is kept.</div>
      )}

      <div className="grid2">
        <div className="stack">
          <Panel
            title="Tasks"
            action={admin && active && <Link className="btn sm" href={`/tasks/new?client=${id}`}>New task</Link>}
          >
            <TaskTable tasks={tasks} showClient={false} emptyTitle="No tasks yet" emptyText={admin ? "Create the first task for this client." : ""} />
          </Panel>
          <Panel title="History">
            <Timeline entries={(activityData ?? []) as unknown as Activity[]} viewerRole={user.role} />
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Details" padded>
            <dl className="info">
              <dt>Email</dt><dd>{client.email}</dd>
              <dt>Phone</dt><dd>{client.phone ?? "—"}</dd>
              <dt>PAN</dt><dd>{client.pan ?? "—"}</dd>
              <dt>GSTIN</dt><dd>{client.gstin ?? "—"}</dd>
              <dt>Services</dt><dd>{services.length ? services.join(", ") : <span className="muted">None yet</span>}</dd>
              {admin && (
                <>
                  <dt>Portal login</dt>
                  <dd>
                    {login ? (
                      <>
                        {login.email}
                        <span className="sub small muted" style={{ display: "block" }}>
                          {!login.is_active ? "Disabled" : login.must_change_password ? "Temporary password not yet changed" : "Active"}
                        </span>
                      </>
                    ) : (
                      <span className="muted">No login</span>
                    )}
                  </dd>
                </>
              )}
            </dl>
          </Panel>

          <Panel title="Assigned staff">
            {staff.length ? (
              <ul className="list">
                {staff.map((s) => (
                  <li key={s.id}>
                    <span>
                      {s.name} {!s.is_active && <span className="badge">Inactive</span>}
                    </span>
                    {admin && (
                      <ActionButton
                        action={unassignStaffAction}
                        fields={{ client_id: id, staff_id: s.id }}
                        label="Remove"
                        className="btn sm"
                        confirmText={`Remove ${s.name} from ${client.name}? They will no longer see this client.`}
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No staff assigned">{admin ? "Assign someone below." : ""}</EmptyState>
            )}
            {admin && active && available.length > 0 && <AssignStaffForm clientId={id} staff={available} />}
          </Panel>
        </div>
      </div>
    </>
  );
}
