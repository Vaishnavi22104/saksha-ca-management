/** Rows per page on every long list. */
export const PAGE_SIZE = 25;

/** ?page=3 -> 3. Anything missing, negative or not a number is page 1. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 10_000);
}

/** Inclusive row range for Supabase's .range(from, to). */
export function rangeFor(page: number, size = PAGE_SIZE) {
  const from = (page - 1) * size;
  return { from, to: from + size - 1 };
}

export function pageCount(total: number, size = PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / size));
}

/**
 * Link to another page of the same list, keeping the filters. A filter that
 * is present but empty is kept on purpose: for some lists "" means "all".
 */
export function pageHref(path: string, params: Record<string, string | undefined>, page: number) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) sp.set(key, value);
  }
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Supabase answers PGRST103 when the requested page is past the last row. */
export const isOutOfRange = (error: { code?: string } | null) => error?.code === "PGRST103";
