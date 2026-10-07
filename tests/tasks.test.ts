import { describe, expect, it } from "vitest";
import { allowedNext, isOpen, isOverdue } from "@/lib/tasks";
import type { AppUser, Task } from "@/lib/types";

const user = (role: AppUser["role"], id = "u1"): AppUser =>
  ({ id, firm_id: "f", name: "N", email: "n@x.test", role, is_active: true, must_change_password: false, phone: null, avatar_url: null });
const task = (over: Partial<Task> = {}): Task =>
  ({ id: "t", assigned_to: "u1", status: "TODO", requires_review: false, due_date: "2026-10-20T11:30:00Z", ...over }) as Task;

describe("allowedNext (which buttons a person sees)", () => {
  it("clients never see status buttons", () => {
    expect(allowedNext(user("CLIENT"), task())).toEqual([]);
  });
  it("staff see nothing on someone else's task", () => {
    expect(allowedNext(user("STAFF", "other"), task())).toEqual([]);
  });
  it("staff can start their own task but not cancel it", () => {
    expect(allowedNext(user("STAFF"), task({ status: "TODO" }))).toEqual(["IN_PROGRESS"]);
  });
  it("admin can start or cancel", () => {
    expect(allowedNext(user("ADMIN"), task({ status: "TODO" }))).toEqual(["IN_PROGRESS", "CANCELLED"]);
  });
  it("when review is required, staff must submit for review, not complete", () => {
    const next = allowedNext(user("STAFF"), task({ status: "IN_PROGRESS", requires_review: true }));
    expect(next).toContain("UNDER_REVIEW");
    expect(next).not.toContain("COMPLETED");
  });
  it("when review is not required, staff complete directly", () => {
    const next = allowedNext(user("STAFF"), task({ status: "IN_PROGRESS", requires_review: false }));
    expect(next).toContain("COMPLETED");
    expect(next).not.toContain("UNDER_REVIEW");
  });
  it("only the admin can approve work under review", () => {
    expect(allowedNext(user("STAFF"), task({ status: "UNDER_REVIEW" }))).toEqual([]);
    expect(allowedNext(user("ADMIN"), task({ status: "UNDER_REVIEW" }))).toEqual(["COMPLETED", "IN_PROGRESS", "CANCELLED"]);
  });
  it("finished tasks are final", () => {
    expect(allowedNext(user("ADMIN"), task({ status: "COMPLETED" }))).toEqual([]);
    expect(allowedNext(user("ADMIN"), task({ status: "CANCELLED" }))).toEqual([]);
  });
});

describe("isOpen / isOverdue", () => {
  const now = new Date("2026-10-21T00:00:00Z");
  it("open means not completed or cancelled", () => {
    expect(isOpen({ status: "TODO" })).toBe(true);
    expect(isOpen({ status: "UNDER_REVIEW" })).toBe(true);
    expect(isOpen({ status: "COMPLETED" })).toBe(false);
    expect(isOpen({ status: "CANCELLED" })).toBe(false);
  });
  it("overdue = open and past due", () => {
    expect(isOverdue({ status: "IN_PROGRESS", due_date: "2026-10-20T11:30:00Z" }, now)).toBe(true);
    expect(isOverdue({ status: "IN_PROGRESS", due_date: "2026-10-25T11:30:00Z" }, now)).toBe(false);
  });
  it("a finished task is never overdue", () => {
    expect(isOverdue({ status: "COMPLETED", due_date: "2020-01-01T00:00:00Z" }, now)).toBe(false);
  });
});
