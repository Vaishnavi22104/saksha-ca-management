import type { NotificationEntity, Role } from "@/lib/types";

export const NOTIFICATION_SELECT = "id, title, message, entity_type, entity_id, read, created_at";

/** Where a notification takes you. Clients have their own, narrower screens. */
export function notificationHref(entity: NotificationEntity, entityId: string, role: Role) {
  switch (entity) {
    case "task":
      return role === "CLIENT" ? "/work" : `/tasks/${entityId}`;
    case "document_request":
      return `/documents/${entityId}`;
    case "message":
      return role === "CLIENT" ? "/messages" : `/messages/${entityId}`;
    case "workflow":
      return `/workflows/runs/${entityId}`;
    case "client":
      return role === "CLIENT" ? "/profile" : `/clients/${entityId}`;
    default:
      return "/dashboard";
  }
}

export const ENTITY_LABEL: Record<NotificationEntity, string> = {
  client: "Client",
  task: "Task",
  document_request: "Document",
  workflow: "Workflow",
  message: "Message",
};
