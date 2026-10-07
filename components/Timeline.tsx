import { EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Activity, Role } from "@/lib/types";

/** Clients never see which staff member did something. */
function actorLabel(a: Activity, viewerRole: Role) {
  if (viewerRole === "CLIENT") return a.actor?.role === "CLIENT" ? "You" : "Your CA firm";
  return a.actor?.name ?? "System";
}

export function Timeline(props: { entries: Activity[]; viewerRole: Role }) {
  if (!props.entries.length) {
    return <EmptyState title="No activity yet">Changes to clients and tasks will appear here.</EmptyState>;
  }
  return (
    <ol className="timeline">
      {props.entries.map((a) => (
        <li key={a.id}>
          <time dateTime={a.created_at}>{formatDateTime(a.created_at)}</time>
          <div>
            {a.description}
            <div className="who">{actorLabel(a, props.viewerRole)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export const ACTIVITY_SELECT = "*, actor:users!activity_logs_user_id_fkey(name, role)";
