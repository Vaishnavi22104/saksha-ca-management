/** Plain functions that turn notifications into one email. No network, so they are easy to test. */

export interface DigestItem {
  id: string;
  title: string;
  message: string;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Groups rows by a key, keeping the order they arrived in. */
export function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = out.get(k);
    if (bucket) bucket.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/** One email per person, however many things happened. */
export function buildDigest(name: string, items: DigestItem[], siteUrl: string) {
  const base = siteUrl.replace(/\/+$/, "");
  const first = (name.trim().split(/\s+/)[0] || "there");
  const subject = items.length === 1 ? items[0].title : `${items.length} updates on SAKSHA`;

  const text =
    `Hi ${first},\n\n` +
    items.map((i) => `- ${i.title}: ${i.message}\n  ${base}/notifications/${i.id}`).join("\n") +
    `\n\nOpen SAKSHA: ${base}/notifications\n\nYou get these emails because notifications are switched on in your profile.`;

  const rows = items
    .map(
      (i) =>
        `<li style="margin:0 0 14px"><a href="${escapeHtml(`${base}/notifications/${i.id}`)}" ` +
        `style="color:#4B32C9;font-weight:600;text-decoration:none">${escapeHtml(i.title)}</a><br>` +
        `<span style="color:#4B534F">${escapeHtml(i.message)}</span></li>`,
    )
    .join("");

  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#101312">` +
    `<p style="margin:0 0 16px">Hi ${escapeHtml(first)},</p>` +
    `<ul style="padding-left:18px;margin:0 0 20px">${rows}</ul>` +
    `<p style="margin:0 0 24px"><a href="${escapeHtml(base + "/notifications")}" ` +
    `style="background:#101312;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Open SAKSHA</a></p>` +
    `<p style="color:#818A85;font-size:12px;margin:0">You get these emails because notifications are switched on in your profile.</p></div>`;

  return { subject, text, html };
}
