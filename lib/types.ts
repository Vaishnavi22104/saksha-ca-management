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
  phone: string | null;
  avatar_url: string | null;
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
  workflow_run_id: string | null;
  workflow_step_no: number | null;
  needs_document: boolean;
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

export type WorkflowStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

export interface WorkflowStep {
  id: string;
  template_id: string;
  position: number;
  title: string;
  requires_document: boolean;
  requires_review: boolean;
  due_offset_days: number;
}

export interface WorkflowTemplate {
  id: string;
  firm_id: string;
  service_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

/** Template with the joins used by the list and detail pages. */
export interface WorkflowTemplateRow extends WorkflowTemplate {
  service: { name: string } | null;
  steps: WorkflowStep[];
}

export interface WorkflowRun {
  id: string;
  firm_id: string;
  client_id: string;
  template_id: string | null;
  service_id: string;
  template_name: string;
  financial_year: string;
  period: string;
  status: WorkflowStatus;
  created_at: string;
  completed_at: string | null;
}

/** Run with the joins used by lists. */
export interface WorkflowRunRow extends WorkflowRun {
  client: { name: string } | null;
  service: { name: string } | null;
}

export type DocumentRequestStatus =
  | "REQUESTED" | "UPLOADED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "CANCELLED";
export type DocumentStatus = "UPLOADED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";

export interface DocumentRequest {
  id: string;
  firm_id: string;
  client_id: string;
  task_id: string | null;
  workflow_run_id: string | null;
  financial_year: string | null;
  period: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: DocumentRequestStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Request with the joins used by the lists and the detail page. */
export interface DocumentRequestRow extends DocumentRequest {
  client: { name: string } | null;
  task: { id: string; title: string } | null;
}

export interface DocumentVersion {
  id: string;
  request_id: string;
  client_id: string;
  version: number;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: DocumentStatus;
  uploaded_by: string;
  uploaded_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  uploader: { name: string; role: Role } | null;
  reviewer: { name: string } | null;
}

export interface Message {
  id: string;
  client_id: string;
  task_id: string | null;
  sender_id: string;
  message: string;
  created_at: string;
  sender: { id: string; name: string; role: Role } | null;
  task?: { id: string; title: string } | null;
}

export type NotificationEntity = "client" | "task" | "document_request" | "workflow" | "message";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  entity_type: NotificationEntity;
  entity_id: string;
  read: boolean;
  created_at: string;
}
