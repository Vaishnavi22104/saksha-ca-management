import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-redirect";

describe("safeNext (open-redirect guard)", () => {
  it("allows paths on this site", () => {
    expect(safeNext("/reset-password")).toBe("/reset-password");
    expect(safeNext("/tasks?status=OPEN")).toBe("/tasks?status=OPEN");
  });
  it("falls back for anything that could leave the site", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "evil", "", null, undefined]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
  });
  it("accepts a custom fallback", () => {
    expect(safeNext("//x", "/login")).toBe("/login");
  });
});
