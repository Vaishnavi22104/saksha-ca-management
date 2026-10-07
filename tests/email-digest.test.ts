import { describe, expect, it } from "vitest";
import { buildDigest, escapeHtml, groupBy } from "@/lib/email-digest";

describe("escapeHtml", () => {
  it("neutralises markup", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
  });
});

describe("groupBy", () => {
  it("groups in arrival order", () => {
    const g = groupBy([{ u: "a", n: 1 }, { u: "b", n: 2 }, { u: "a", n: 3 }], (r) => r.u);
    expect([...g.keys()]).toEqual(["a", "b"]);
    expect(g.get("a")?.map((r) => r.n)).toEqual([1, 3]);
  });
});

describe("buildDigest", () => {
  const item = (id: string, title: string, message = "msg") => ({ id, title, message });

  it("uses the notification title as the subject when there is one", () => {
    expect(buildDigest("Anil Sharma", [item("1", "Task due soon")], "https://x.test").subject).toBe("Task due soon");
  });
  it("counts updates when there are several", () => {
    expect(buildDigest("A", [item("1", "a"), item("2", "b"), item("3", "c")], "https://x.test").subject).toBe("3 updates on SAKSHA");
  });
  it("greets by first name and falls back politely", () => {
    expect(buildDigest("Anil Sharma", [item("1", "t")], "https://x.test").text).toMatch(/^Hi Anil,/);
    expect(buildDigest("  ", [item("1", "t")], "https://x.test").text).toMatch(/^Hi there,/);
  });
  it("links each item and the inbox, without a double slash", () => {
    const m = buildDigest("A", [item("abc", "t")], "https://x.test/");
    expect(m.text).toContain("https://x.test/notifications/abc");
    expect(m.html).toContain("https://x.test/notifications");
    expect(m.html).not.toContain("test//notifications");
  });
  it("escapes anything a client could have typed into a message", () => {
    const m = buildDigest("A", [item("1", "Message from <b>X</b>", `<img src=x onerror=alert(1)>`)], "https://x.test");
    expect(m.html).not.toContain("<img");
    expect(m.html).not.toContain("<b>X</b>");
    expect(m.html).toContain("&lt;img");
  });
});
