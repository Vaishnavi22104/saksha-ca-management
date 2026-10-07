import { describe, expect, it } from "vitest";
import { chatStamp, currentFinancialYear, dayKey, dueDateFromInput, greeting, plural } from "@/lib/format";

describe("financial year (April to March, India time)", () => {
  it("October 2026 is 2026-27", () => {
    expect(currentFinancialYear(new Date("2026-10-07T10:00:00Z"))).toBe("2026-27");
  });
  it("31 March is still the old year", () => {
    expect(currentFinancialYear(new Date("2026-03-31T10:00:00Z"))).toBe("2025-26");
  });
  it("1 April IST starts the new year even while it is still 31 March in UTC", () => {
    expect(currentFinancialYear(new Date("2026-03-31T19:00:00Z"))).toBe("2026-27");
  });
  it("pads the century boundary", () => {
    expect(currentFinancialYear(new Date("2099-06-01T00:00:00Z"))).toBe("2099-00");
  });
});

describe("dayKey uses India time", () => {
  it("rolls over at midnight IST, not UTC", () => {
    expect(dayKey("2026-04-01T20:00:00Z")).toBe("2026-04-02");
    expect(dayKey("2026-04-01T17:00:00Z")).toBe("2026-04-01");
  });
});

describe("small helpers", () => {
  it("plural", () => {
    expect(plural(1, "client", "clients")).toBe("1 client");
    expect(plural(0, "client", "clients")).toBe("0 clients");
    expect(plural(5, "client", "clients")).toBe("5 clients");
  });
  it("due dates are 5 PM India time", () => {
    expect(dueDateFromInput("2026-10-20")).toBe("2026-10-20T17:00:00+05:30");
    expect(new Date(dueDateFromInput("2026-10-20")).toISOString()).toBe("2026-10-20T11:30:00.000Z");
  });
  it("greeting follows India time", () => {
    expect(greeting(new Date("2026-10-07T03:00:00Z"))).toBe("Good morning");
    expect(greeting(new Date("2026-10-07T08:00:00Z"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-10-07T14:00:00Z"))).toBe("Good evening");
  });
  it("chat stamp says Yesterday for the previous day", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    expect(chatStamp(new Date("2026-10-06T10:00:00Z"), now)).toBe("Yesterday");
  });
});
