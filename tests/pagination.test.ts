import { describe, expect, it } from "vitest";
import { PAGE_SIZE, isOutOfRange, pageCount, pageHref, parsePage, rangeFor } from "@/lib/pagination";

describe("parsePage", () => {
  it("defaults to page 1", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("abc")).toBe(1);
  });
  it("rejects zero, negatives and decimals-as-garbage", () => {
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-4")).toBe(1);
  });
  it("accepts a real page and caps absurd ones", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("99999999")).toBe(10_000);
  });
  it("takes the first value when the param is repeated", () => {
    expect(parsePage(["2", "7"])).toBe(2);
  });
});

describe("rangeFor / pageCount", () => {
  it("gives inclusive ranges", () => {
    expect(rangeFor(1)).toEqual({ from: 0, to: PAGE_SIZE - 1 });
    expect(rangeFor(3, 10)).toEqual({ from: 20, to: 29 });
  });
  it("never reports fewer than one page", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(25)).toBe(1);
    expect(pageCount(26)).toBe(2);
    expect(pageCount(101, 50)).toBe(3);
  });
});

describe("pageHref", () => {
  it("omits page 1 and keeps filters", () => {
    expect(pageHref("/tasks", { q: "gst" }, 1)).toBe("/tasks?q=gst");
    expect(pageHref("/tasks", { q: "gst" }, 2)).toBe("/tasks?q=gst&page=2");
  });
  it("drops undefined filters but keeps empty ones, which can mean 'all'", () => {
    expect(pageHref("/clients", { q: undefined, status: "" }, 2)).toBe("/clients?status=&page=2");
  });
  it("is just the path when there is nothing to add", () => {
    expect(pageHref("/activity", {}, 1)).toBe("/activity");
  });
  it("encodes values", () => {
    expect(pageHref("/clients", { q: "a&b" }, 1)).toBe("/clients?q=a%26b");
  });
});

describe("isOutOfRange", () => {
  it("recognises the Supabase range error only", () => {
    expect(isOutOfRange({ code: "PGRST103" })).toBe(true);
    expect(isOutOfRange({ code: "42501" })).toBe(false);
    expect(isOutOfRange(null)).toBe(false);
  });
});
