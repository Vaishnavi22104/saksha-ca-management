import Link from "next/link";
import { pageCount, pageHref, PAGE_SIZE } from "@/lib/pagination";

/** Previous / Next controls under a list. Renders nothing when everything fits on one page. */
export function Pager(props: {
  path: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  size?: number;
}) {
  const size = props.size ?? PAGE_SIZE;
  const pages = pageCount(props.total, size);
  if (pages <= 1) return null;
  const from = (props.page - 1) * size + 1;
  const to = Math.min(props.total, props.page * size);

  return (
    <nav className="pager" aria-label="Pagination">
      <span className="muted small">{from}–{to} of {props.total}</span>
      <span className="pager-links">
        {props.page > 1 ? (
          <Link className="btn sm" rel="prev" href={pageHref(props.path, props.params, props.page - 1)}>Previous</Link>
        ) : (
          <span className="btn sm" aria-disabled="true">Previous</span>
        )}
        <span className="small">Page {props.page} of {pages}</span>
        {props.page < pages ? (
          <Link className="btn sm" rel="next" href={pageHref(props.path, props.params, props.page + 1)}>Next</Link>
        ) : (
          <span className="btn sm" aria-disabled="true">Next</span>
        )}
      </span>
    </nav>
  );
}
