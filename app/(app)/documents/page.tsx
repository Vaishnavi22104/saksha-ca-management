import Link from "next/link";
import { redirect } from "next/navigation";
import { Pager } from "@/components/Pager";
import { isOutOfRange, pageHref, parsePage, rangeFor } from "@/lib/pagination";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { REQUEST_SELECT, REQUEST_STATUS, isRequestOpen } from "@/lib/documents";
import type { DocumentRequestRow, DocumentRequestStatus } from "@/lib/types";

const FILTERS: { key: string; label: string; statuses?: DocumentRequestStatus[] }[] = [
  { key: "open", label: "Open", statuses: ["REQUESTED", "UPLOADED", "UNDER_REVIEW", "REJECTED"] },
  { key: "review", label: "Awaiting review", statuses: ["UPLOADED", "UNDER_REVIEW"] },
  { key: "accepted", label: "Accepted", statuses: ["ACCEPTED"] },
  { key: "all", label: "All" },
];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  const user = await requireUser(["ADMIN", "STAFF", "CLIENT"]);
  const { view, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const { from, to } = rangeFor(page);
  const client = user.role === "CLIENT";
  const active = FILTERS.find((f) => f.key === view) ?? FILTERS[0];

  const supabase = await createClient();
  let query = supabase.from("document_requests").select(REQUEST_SELECT, { count: "exact" }).order("created_at", { ascending: false }).order("id");
  if (active.statuses) query = query.in("status", active.statuses);

  const { data, count, error } = await query.range(from, to);
  if (isOutOfRange(error)) redirect(pageHref("/documents", { view }, 1));
  const requests = (data ?? []) as unknown as DocumentRequestRow[];
  const total = count ?? requests.length;

  // The banner counts everything still owed, not just this page.
  let waitingCount = 0;
  if (client) {
    const { count: owed } = await supabase
      .from("document_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["REQUESTED", "REJECTED"]);
    waitingCount = owed ?? 0;
  }

  return (
    <>
      <PageHeader
        title="Documents"
        description={
          client
            ? "Files your CA firm has asked you for. Uploads are private to your firm."
            : "What each client still owes you, and the files they have sent."
        }
        actions={client ? undefined : <Link className="btn primary" href="/documents/new">Request a document</Link>}
      />

      {client && waitingCount > 0 && (
        <div className="notice" role="status">
          {waitingCount === 1
            ? "1 document is still needed from you."
            : `${waitingCount} documents are still needed from you.`}
        </div>
      )}

      <Panel
        title={active.label}
        action={
          <span className="filters">
            {FILTERS.map((f) => (
              <Link key={f.key} className={f.key === active.key ? "linkbtn me" : "linkbtn"} href={`/documents?view=${f.key}`}>
                {f.label}
              </Link>
            ))}
          </span>
        }
      >
        {requests.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  {!client && <th>Client</th>}
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="first">
                      <Link className="rowlink" href={`/documents/${r.id}`}>{r.title}</Link>
                      <span className="sub">
                        {r.period ? `${r.period} · ` : ""}
                        {r.task ? `for "${r.task.title}"` : "standalone request"}
                      </span>
                    </td>
                    {!client && <td>{r.client?.name}</td>}
                    <td className="nowrap">
                      {r.due_date ? formatDate(r.due_date) : <span className="muted">No date</span>}
                    </td>
                    <td className="nowrap">
                      <span className={`badge ${REQUEST_STATUS[r.status].tone ? "b-" + REQUEST_STATUS[r.status].tone : ""}`}>
                        {client && r.status === "REQUESTED" ? "Needed from you" : REQUEST_STATUS[r.status].label}
                      </span>
                      {isRequestOpen(r.status) && r.due_date && new Date(r.due_date) < new Date() && (
                        <> <span className="badge b-red">Overdue</span></>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={client ? "Nothing needed from you" : "No document requests"}>
            {client
              ? "When your CA needs a file, it will appear here."
              : <Link href="/documents/new">Request a document from a client.</Link>}
          </EmptyState>
        )}
        <Pager path="/documents" params={{ view }} page={page} total={total} />
      </Panel>
    </>
  );
}
