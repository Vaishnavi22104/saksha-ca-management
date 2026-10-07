import { describe, expect, it } from "vitest";
import {
  clientSchema, documentRequestSchema, fieldErrors, generateTempPassword, messageSchema,
  passwordSchema, rejectionSchema, stepsFromFormData, taskSchema, templateSchema,
} from "@/lib/validation";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("clientSchema", () => {
  const ok = { name: "ABC Traders", email: "Owner@ABC.test", phone: "", pan: "", gstin: "", business_type: "LLP" };

  it("accepts a minimal client and normalises the email", () => {
    const r = clientSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("owner@abc.test");
  });
  it("treats blank optional fields as absent", () => {
    const r = clientSchema.safeParse(ok);
    if (r.success) expect(r.data.pan).toBeUndefined();
  });
  it("uppercases and accepts a valid PAN and GSTIN", () => {
    const r = clientSchema.safeParse({ ...ok, pan: "abcde1234f", gstin: "27abcde1234f1z5" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.pan).toBe("ABCDE1234F");
  });
  it.each(["ABCDE12345", "ABCD1234F", "12345ABCDE"])("rejects PAN %s", (pan) => {
    expect(clientSchema.safeParse({ ...ok, pan }).success).toBe(false);
  });
  it("rejects a short GSTIN", () => {
    expect(clientSchema.safeParse({ ...ok, gstin: "27ABCDE" }).success).toBe(false);
  });
  it.each(["12345", "5123456789", "98765432101"])("rejects phone %s", (phone) => {
    expect(clientSchema.safeParse({ ...ok, phone }).success).toBe(false);
  });
  it.each(["9876543210", "+919876543210"])("accepts phone %s", (phone) => {
    expect(clientSchema.safeParse({ ...ok, phone }).success).toBe(true);
  });
  it("requires a name, a valid email and a known business type", () => {
    expect(clientSchema.safeParse({ ...ok, name: "  " }).success).toBe(false);
    expect(clientSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(clientSchema.safeParse({ ...ok, business_type: "Cult" }).success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepts matching passwords of 8+ characters", () => {
    expect(passwordSchema.safeParse({ password: "longenough1", confirm: "longenough1" }).success).toBe(true);
  });
  it("rejects short passwords", () => {
    expect(passwordSchema.safeParse({ password: "short", confirm: "short" }).success).toBe(false);
  });
  it("rejects a mismatch and blames the confirm field", () => {
    const r = passwordSchema.safeParse({ password: "longenough1", confirm: "different12" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).confirm).toMatch(/match/);
  });
});

describe("taskSchema", () => {
  const ok = {
    client_id: uuid, service_id: uuid, title: "File GSTR-3B", financial_year: "2026-27",
    period: "September 2026", due: "2026-10-20", priority: "HIGH", assigned_to: "", requires_review: "on",
  };
  it("accepts a task; blank assignee becomes null, checkbox becomes true", () => {
    const r = taskSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.assigned_to).toBeNull();
      expect(r.data.requires_review).toBe(true);
    }
  });
  it("rejects a malformed financial year and due date", () => {
    expect(taskSchema.safeParse({ ...ok, financial_year: "2026" }).success).toBe(false);
    expect(taskSchema.safeParse({ ...ok, due: "20/10/2026" }).success).toBe(false);
  });
  it("rejects an unknown priority", () => {
    expect(taskSchema.safeParse({ ...ok, priority: "URGENT" }).success).toBe(false);
  });
});

describe("templateSchema and stepsFromFormData", () => {
  const step = { title: "Collect sales data", requires_document: true, requires_review: false, due_offset_days: 2 };
  it("needs at least one step and at most 30", () => {
    const base = { name: "GST monthly", service_id: uuid };
    expect(templateSchema.safeParse({ ...base, steps: [] }).success).toBe(false);
    expect(templateSchema.safeParse({ ...base, steps: [step] }).success).toBe(true);
    expect(templateSchema.safeParse({ ...base, steps: Array(31).fill(step) }).success).toBe(false);
  });
  it("bounds the day offset", () => {
    const base = { name: "x", service_id: uuid };
    expect(templateSchema.safeParse({ ...base, steps: [{ ...step, due_offset_days: -1 }] }).success).toBe(false);
    expect(templateSchema.safeParse({ ...base, steps: [{ ...step, due_offset_days: 366 }] }).success).toBe(false);
  });
  it("rebuilds steps from repeated form fields and drops blank titles", () => {
    const fd = new FormData();
    fd.append("step_title", "Collect data");
    fd.append("step_title", "   ");
    fd.append("step_title", "File return");
    fd.append("step_offset", "1");
    fd.append("step_offset", "9");
    fd.append("step_offset", "5");
    fd.append("step_document", "0");
    fd.append("step_review", "2");
    expect(stepsFromFormData(fd)).toEqual([
      { title: "Collect data", requires_document: true, requires_review: false, due_offset_days: 1 },
      { title: "File return", requires_document: false, requires_review: true, due_offset_days: 5 },
    ]);
  });
});

describe("other schemas", () => {
  it("document request: title required, due date optional", () => {
    expect(documentRequestSchema.safeParse({ client_id: uuid, title: "Bank statement", task_id: "", due: "" }).success).toBe(true);
    expect(documentRequestSchema.safeParse({ client_id: uuid, title: "", task_id: "", due: "" }).success).toBe(false);
  });
  it("rejection needs a real reason", () => {
    expect(rejectionSchema.safeParse({ reason: "no" }).success).toBe(false);
    expect(rejectionSchema.safeParse({ reason: "Scan is unreadable" }).success).toBe(true);
  });
  it("messages: not empty, not over 2000 characters", () => {
    expect(messageSchema.safeParse({ client_id: uuid, message: "  ", task_id: "" }).success).toBe(false);
    expect(messageSchema.safeParse({ client_id: uuid, message: "x".repeat(2001), task_id: "" }).success).toBe(false);
    expect(messageSchema.safeParse({ client_id: uuid, message: "Hello", task_id: "" }).success).toBe(true);
  });
});

describe("generateTempPassword", () => {
  it("is long, prefixed and avoids look-alike characters", () => {
    const p = generateTempPassword();
    expect(p).toMatch(/^Tmp-[A-HJ-NP-Za-km-z2-9]{12}$/);
  });
  it("is different every time", () => {
    const seen = new Set(Array.from({ length: 50 }, generateTempPassword));
    expect(seen.size).toBe(50);
  });
});
