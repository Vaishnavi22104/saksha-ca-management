import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { TASK_SELECT, isOpen, isOverdue } from "@/lib/tasks";
import type { TaskRow, TaskStatus } from "@/lib/types";

/**
 * Natural-language search, done safely.
 *
 * The model never writes SQL and never touches the database. It only
 * proposes FILTERS as JSON. Those filters are validated here against a
 * fixed schema and against the firm's own lists, and then this file —
 * not the model — runs the query through Row Level Security.
 *
 *   question -> model -> JSON filters -> validation -> our query -> rows
 *
 * If the model is unavailable or answers badly, `parseWithRules` reads
 * the question with plain keyword rules instead, so the feature still
 * works with no model at all.
 */

const STATUSES = ["TODO", "IN_PROGRESS", "WAITING_FOR_CLIENT", "UNDER_REVIEW", "COMPLETED", "CANCELLED"] as const;

export const searchFilterSchema = z.object({
  status: z.enum([...STATUSES, "OPEN", "OVERDUE"]).optional(),
  service: z.string().trim().max(40).optional(),
  client: z.string().trim().max(80).optional(),
  assignee: z.string().trim().max(80).optional(),
  period: z.string().trim().max(40).optional(),
  due_within_days: z.number().int().min(0).max(365).optional(),
  unassigned: z.boolean().optional(),
  needs_document: z.boolean().optional(),
});

export type SearchFilters = z.infer<typeof searchFilterSchema>;

export interface FirmVocabulary {
  clients: string[];
  services: string[];
  staff: string[];
}

/** The lists the model is allowed to choose from, and we validate against. */
export async function loadVocabulary(): Promise<FirmVocabulary> {
  const supabase = await createClient();
  const [{ data: clients }, { data: services }, { data: staff }] = await Promise.all([
    supabase.from("clients").select("name").order("name"),
    supabase.from("services").select("name").eq("is_active", true).order("name"),
    supabase.from("users").select("name").eq("role", "STAFF").eq("is_active", true).order("name"),
  ]);
  return {
    clients: (clients ?? []).map((c) => c.name as string),
    services: (services ?? []).map((s) => s.name as string),
    staff: (staff ?? []).map((s) => s.name as string),
  };
}

/** Pulls the first JSON object out of a model answer that may have prose around it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Validates the model's proposal. Anything unknown is dropped rather
 * than trusted: a service or person the firm doesn't have cannot reach
 * the query.
 */
export function validateFilters(raw: unknown, vocabulary: FirmVocabulary): { filters: SearchFilters; dropped: string[] } {
  const parsed = searchFilterSchema.safeParse(raw ?? {});
  if (!parsed.success) return { filters: {}, dropped: ["the whole filter set was malformed"] };

  const filters: SearchFilters = { ...parsed.data };
  const dropped: string[] = [];

  const matchOne = (value: string, list: string[]) =>
    list.find((item) => item.toLowerCase() === value.toLowerCase()) ??
    list.find((item) => item.toLowerCase().includes(value.toLowerCase()));

  if (filters.service) {
    const match = matchOne(filters.service, vocabulary.services);
    if (match) filters.service = match;
    else {
      dropped.push(`service "${filters.service}" is not one of your services`);
      delete filters.service;
    }
  }
  if (filters.client) {
    const match = matchOne(filters.client, vocabulary.clients);
    if (match) filters.client = match;
    else {
      dropped.push(`client "${filters.client}" is not in your client list`);
      delete filters.client;
    }
  }
  if (filters.assignee) {
    const match = matchOne(filters.assignee, vocabulary.staff);
    if (match) filters.assignee = match;
    else {
      dropped.push(`staff member "${filters.assignee}" is not in your firm`);
      delete filters.assignee;
    }
  }

  return { filters, dropped };
}

/** Keyword reading of the question. Used when no model answers. */
export function parseWithRules(question: string, vocabulary: FirmVocabulary): SearchFilters {
  const q = question.toLowerCase();
  const filters: SearchFilters = {};

  if (q.includes("overdue") || q.includes("late")) filters.status = "OVERDUE";
  else if (q.includes("waiting for client") || q.includes("blocked on client")) filters.status = "WAITING_FOR_CLIENT";
  else if (q.includes("review")) filters.status = "UNDER_REVIEW";
  else if (q.includes("completed") || q.includes("finished") || q.includes("done")) filters.status = "COMPLETED";
  else if (q.includes("in progress") || q.includes("started")) filters.status = "IN_PROGRESS";
  else if (q.includes("not started") || q.includes("to do") || q.includes("todo")) filters.status = "TODO";
  else if (q.includes("open") || q.includes("pending") || q.includes("outstanding")) filters.status = "OPEN";

  const days = q.match(/(\d{1,3})\s*days?/);
  if (days) filters.due_within_days = Math.min(365, Number(days[1]));
  else if (q.includes("this week") || q.includes("next week") || q.includes("7 days")) filters.due_within_days = 7;
  else if (q.includes("today")) filters.due_within_days = 0;
  else if (q.includes("this month") || q.includes("30 days")) filters.due_within_days = 30;

  if (q.includes("unassigned") || q.includes("nobody")) filters.unassigned = true;
  if (q.includes("document") || q.includes("upload") || q.includes("file")) filters.needs_document = true;

  for (const service of vocabulary.services) if (q.includes(service.toLowerCase())) filters.service = service;
  for (const client of vocabulary.clients) if (q.includes(client.toLowerCase())) filters.client = client;
  for (const person of vocabulary.staff) {
    const first = person.split(" ")[0].toLowerCase();
    if (first.length > 2 && q.includes(first)) filters.assignee = person;
  }

  return filters;
}

/** The prompt that asks for filters, never for an answer. */
export function filterPrompt(question: string, vocabulary: FirmVocabulary) {
  return [
    "Convert the question into search filters for a task list. Reply with ONE JSON object and nothing else.",
    "",
    "Allowed keys (omit any that do not apply):",
    `  status: one of OPEN, OVERDUE, ${STATUSES.join(", ")}`,
    `  service: one of ${vocabulary.services.join(" | ") || "(none)"}`,
    `  client: one of ${vocabulary.clients.join(" | ") || "(none)"}`,
    `  assignee: one of ${vocabulary.staff.join(" | ") || "(none)"}`,
    "  period: free text such as September 2026",
    "  due_within_days: whole number 0-365",
    "  unassigned: true or false",
    "  needs_document: true or false",
    "",
    "Never invent a client, service or person that is not listed above. Omit the key instead.",
    "",
    `QUESTION: ${question}`,
  ].join("\n");
}

/** Runs the validated filters. RLS still decides what this user may see. */
export async function runTaskSearch(filters: SearchFilters): Promise<TaskRow[]> {
  const supabase = await createClient();
  const now = new Date();

  let query = supabase.from("tasks").select(TASK_SELECT).order("due_date").limit(200);

  // Only the plain status values are safe to push to the database;
  // OPEN and OVERDUE are derived, so they are applied below.
  if (filters.status && (STATUSES as readonly string[]).includes(filters.status)) {
    query = query.eq("status", filters.status as TaskStatus);
  }
  if (filters.period) query = query.ilike("period", `%${filters.period.replace(/[%,()]/g, " ")}%`);
  if (filters.unassigned) query = query.is("assigned_to", null);
  if (filters.needs_document) query = query.eq("needs_document", true);

  const { data } = await query;
  let rows = (data ?? []) as unknown as TaskRow[];

  if (filters.status === "OPEN") rows = rows.filter(isOpen);
  if (filters.status === "OVERDUE") rows = rows.filter((t) => isOverdue(t, now));
  if (filters.service) rows = rows.filter((t) => t.service?.name === filters.service);
  if (filters.client) rows = rows.filter((t) => t.client?.name === filters.client);
  if (filters.assignee) rows = rows.filter((t) => t.assignee?.name === filters.assignee);
  if (filters.due_within_days !== undefined) {
    const limit = new Date(now.getTime() + filters.due_within_days * 864e5);
    rows = rows.filter((t) => new Date(t.due_date) <= limit && isOpen(t));
  }

  return rows.slice(0, 50);
}

/** Human-readable version of what was actually applied. */
export function describeFilters(filters: SearchFilters): string[] {
  const out: string[] = [];
  if (filters.status) out.push(`status: ${filters.status.replace(/_/g, " ").toLowerCase()}`);
  if (filters.service) out.push(`service: ${filters.service}`);
  if (filters.client) out.push(`client: ${filters.client}`);
  if (filters.assignee) out.push(`assigned to: ${filters.assignee}`);
  if (filters.period) out.push(`period: ${filters.period}`);
  if (filters.due_within_days !== undefined) out.push(`due within ${filters.due_within_days} day(s)`);
  if (filters.unassigned) out.push("unassigned only");
  if (filters.needs_document) out.push("needs a client document");
  return out;
}
