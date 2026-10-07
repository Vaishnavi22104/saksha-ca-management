import { describe, expect, it } from "vitest";
import { notificationHref } from "@/lib/notifications";

describe("notificationHref (where a notification takes you)", () => {
  it("staff go to the task, clients to their work page", () => {
    expect(notificationHref("task", "t1", "STAFF")).toBe("/tasks/t1");
    expect(notificationHref("task", "t1", "CLIENT")).toBe("/work");
  });
  it("document requests open the same page for everyone", () => {
    expect(notificationHref("document_request", "d1", "CLIENT")).toBe("/documents/d1");
  });
  it("messages open the right conversation", () => {
    expect(notificationHref("message", "c1", "ADMIN")).toBe("/messages/c1");
    expect(notificationHref("message", "c1", "CLIENT")).toBe("/messages");
  });
  it("clients are never sent to staff-only pages", () => {
    expect(notificationHref("client", "c1", "CLIENT")).toBe("/profile");
    expect(notificationHref("workflow", "w1", "ADMIN")).toBe("/workflows/runs/w1");
  });
});
