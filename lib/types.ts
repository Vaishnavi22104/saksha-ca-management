export type Role = "ADMIN" | "STAFF" | "CLIENT";
export type ClientStatus = "ACTIVE" | "INACTIVE";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "WAITING_FOR_CLIENT" | "UNDER_REVIEW" | "COMPLETED" | "CANCELLED";
export type Priority = "LOW" | "MEDIUM" | "HIGH";

export interface AppUser {
  id: string;
  firm_id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
}

export interface Client {
  id: string;
  firm_id: string;
  name: string;
  email: string;
  phone: string | null;
  pan: string | null;
  gstin: string | null;
  business_type: string | null;
  status: ClientStatus;
  created_at: string;
}

export interface Task {
  id: string;
  client_id: string;
  service_id: string;
  financial_year: string;
  period: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  status: TaskStatus;
  priority: Priority;
  requires_review: boolean;
  due_date: string;
  created_at: string;
  completed_at: string | null;
}

/** Task row with the joined names used by lists. */
export interface TaskRow extends Task {
  client: { name: string } | null;
  service: { name: string } | null;
  assignee: { name: string } | null;
}

export interface Activity {
  id: string;
  user_id: string | null;
  client_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action: string;
  description: string;
  created_at: string;
  actor: { name: string; role: Role } | null;
}

/** Shape returned by every form server action. */
export interface ActionState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  credentials?: { email: string; password: string; name: string };
}
