/**
 * A "?next=" value is only followed if it is a path on this site.
 * Rejects other hosts ("https://evil.test", "//evil.test") and backslash tricks.
 */
export function safeNext(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
