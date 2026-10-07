import { z } from "zod";

const optional = (schema: z.ZodString) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

export const BUSINESS_TYPES = [
  "Proprietorship", "Partnership", "LLP", "Private Limited", "Public Limited", "Trust", "Individual", "Other",
] as const;

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Enter the client's name.").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: optional(z.string().trim().regex(/^(\+91)?[6-9]\d{9}$/, "Use a 10-digit mobile number.")),
  pan: optional(z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN format is ABCDE1234F.")),
  gstin: optional(z.string().trim().toUpperCase().regex(/^\d{2}[A-Z0-9]{13}$/, "GSTIN has 15 characters.")),
  business_type: z.enum(BUSINESS_TYPES),
});

export const staffSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

export const taskSchema = z.object({
  client_id: z.string().uuid("Choose a client."),
  service_id: z.string().uuid("Choose a service."),
  title: z.string().trim().min(1, "Enter a task title.").max(200),
  financial_year: z.string().regex(/^\d{4}-\d{2}$/, "Use the format 2026-27."),
  period: z.string().trim().min(1, "Enter a period, for example September 2026.").max(60),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  assigned_to: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
  requires_review: z.preprocess((v) => v === "on", z.boolean()),
  description: z.string().trim().max(2000).optional(),
});

export const passwordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "The two passwords don't match.", path: ["confirm"] });

/** zod issues -> { field: first message } */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Temporary password for provisioned accounts. */
export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "Tmp-" + Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** One step of a workflow template, as it arrives from the template form. */
export const stepSchema = z.object({
  title: z.string().trim().min(1, "Every step needs a title.").max(200),
  requires_document: z.boolean(),
  requires_review: z.boolean(),
  due_offset_days: z.number().int().min(0, "Use 0 or more days.").max(365, "Use 365 days or fewer."),
});

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name.").max(120),
  service_id: z.string().uuid("Choose a service."),
  description: z.string().trim().max(500).optional(),
  steps: z.array(stepSchema).min(1, "Add at least one step.").max(30, "Use 30 steps or fewer."),
});

export const generateWorkflowSchema = z.object({
  template_id: z.string().uuid("Choose a template."),
  client_id: z.string().uuid("Choose a client."),
  financial_year: z.string().regex(/^\d{4}-\d{2}$/, "Use the format 2026-27."),
  period: z.string().trim().min(1, "Enter a period, for example September 2026.").max(60),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start due date."),
  assigned_to: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
  allow_duplicate: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

/** Rebuilds the steps array from the repeated fields of the template form. */
export function stepsFromFormData(formData: FormData) {
  const titles = formData.getAll("step_title").map(String);
  const documents = new Set(formData.getAll("step_document").map(String));
  const reviews = new Set(formData.getAll("step_review").map(String));
  const offsets = formData.getAll("step_offset").map(String);
  return titles
    .map((title, i) => ({
      title,
      requires_document: documents.has(String(i)),
      requires_review: reviews.has(String(i)),
      due_offset_days: Number(offsets[i] ?? 0) || 0,
    }))
    .filter((s) => s.title.trim() !== "");
}

export const documentRequestSchema = z.object({
  client_id: z.string().uuid("Choose a client."),
  title: z.string().trim().min(1, "Say what you need, for example September bank statement.").max(200),
  description: z.string().trim().max(500).optional(),
  task_id: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
  due: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date.").optional(),
  ),
});

export const rejectionSchema = z.object({
  reason: z.string().trim().min(3, "Tell the client what is wrong with the file.").max(500),
});

export const messageSchema = z.object({
  client_id: z.string().uuid("Choose a client."),
  message: z.string().trim().min(1, "Write a message first.").max(2000, "Messages are limited to 2000 characters."),
  task_id: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
});
