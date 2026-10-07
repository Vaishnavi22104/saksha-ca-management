import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { ACTIVITY_SELECT, Timeline } from "@/components/Timeline";
import { AccessDenied, EmptyState, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { DOCUMENT_STATUS, REQUEST_SELECT, REQUEST_STATUS, formatBytes } from "@/lib/documents";
import type { Activity, DocumentRequestRow, DocumentVersion } from "@/lib/types";
import { cancelRequestAction, deleteDocumentAction } from "../actions";
import { DocumentThumb } from "./DocumentViewer";
import { ReviewForm } from "./ReviewForm";
import { UploadForm } from "./UploadForm";

export default async function DocumentRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["ADMIN", "STAFF", "CLIENT"]);
  const { id } = await params;
  const supabase = await createClient();

  // RLS hides other clients' requests: that looks the same as "not found".
  const { data } = await supabase.from("document_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
  if (!data) return <AccessDenied />;
  const request = data as unknown as DocumentRequestRow;

  const [{ data: versionData }, { data: activityData }] = await Promise.all([
    supabase
      .from("documents")
      .select("*, uploader:users!documents_uploaded_by_fkey(name, role), reviewer:users!documents_reviewed_by_fkey(name)")
      .eq("request_id", id)
      .order("version", { ascending: false }),
    supabase
      .from("activity_logs")
      .select(ACTIVITY_SELECT)
      .eq("entity_type", "document_request")
      .eq("entity_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const versions = (versionData ?? []) as unknown as DocumentVersion[];
  const latest = versions[0];
  const admin = user.role === "ADMIN";
  const isClient = user.role === "CLIENT";
  const status = REQUEST_STATUS[request.status];
  const canUpload = request.status !== "ACCEPTED" && request.status !== "CANCELLED";
  const canReview = admin && latest?.status === "UPLOADED";

  // Verified or not, stated plainly — it is the one thing everybody
  // opening this page wants to know.
  const verdict = !latest
    ? { tone: "wait", title: "Nothing uploaded yet", body: isClient ? "Upload the file your CA asked for." : "Waiting for the client to send this file." }
    : latest.status === "ACCEPTED"
      ? {
          tone: "ok",
          title: "Verified by your CA",
          body: `Version ${latest.version} was accepted${latest.reviewed_at ? ` on ${formatDate(latest.reviewed_at)}` : ""}${latest.reviewer?.name && !isClient ? ` by ${latest.reviewer.name}` : ""}.`,
        }
      : latest.status === "REJECTED"
        ? {
            tone: "no",
            title: "Not verified — changes requested",
            body: latest.rejection_reason ?? "Your CA asked for a different file.",
          }
        : {
            tone: "wait",
            title: "Not verified yet",
            body: admin ? `Version ${latest.version} is waiting for your review.` : "Your CA firm has not reviewed this yet.",
          };

  return (
    <>
      <PageHeader
        crumb={<Link href="/documents">Documents</Link>}
        title={request.title}
        description={
          <>
            <span className={`badge ${status.tone ? "b-" + status.tone : ""}`}>{status.label}</span>{" "}
            <span className="muted">
              {!isClient && request.client?.name ? `${request.client.name} · ` : ""}
              {request.period ? `${request.period} · ` : ""}
              {request.due_date ? `needed by ${formatDate(request.due_date)}` : "no date set"}
            </span>
          </>
        }
        actions={
          admin && request.status !== "ACCEPTED" && request.status !== "CANCELLED" ? (
            <ActionButton
              action={cancelRequestAction}
              fields={{ request_id: id }}
              label="Cancel request"
              confirmText="Cancel this request? The client will no longer be asked for this file."
            />
          ) : null
        }
      />

      <div className="grid2">
        <div className="stack">
          <div className={`verify v-${verdict.tone}`} role="status">
            <span className="verify-i" aria-hidden="true">
              {verdict.tone === "ok" ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4"
                  strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
              ) : verdict.tone === "no" ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>
              )}
            </span>
            <span>
              <b>{verdict.title}</b>
              <span className="small">{verdict.body}</span>
            </span>
          </div>

          <Panel title="Versions">
            {versions.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Version</th><th>File</th><th>Uploaded</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.id} className={v.status === "ACCEPTED" ? "row-ok" : v.status === "REJECTED" ? "row-no" : undefined}>
                        <td>v{v.version}</td>
                        <td className="first">
                          <span className="filecell">
                            <DocumentThumb id={v.id} fileName={v.file_name} mimeType={v.mime_type ?? ""} />
                            <span className="filecell-t">
                              <span className="strong">{v.file_name}</span>
                              <span className="sub">
                                {formatBytes(v.size_bytes)}
                                {v.rejection_reason ? ` · ${v.rejection_reason}` : ""}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="nowrap">
                          {formatDateTime(v.uploaded_at)}
                          <span className="sub">
                            {isClient
                              ? v.uploader?.role === "CLIENT" ? "You" : "Your CA firm"
                              : v.uploader?.name ?? "—"}
                          </span>
                        </td>
                        <td className="nowrap">
                          <span className={`badge ${DOCUMENT_STATUS[v.status].tone ? "b-" + DOCUMENT_STATUS[v.status].tone : ""}`}>
                            {DOCUMENT_STATUS[v.status].label}
                          </span>
                        </td>
                        <td className="nowrap right">
                          <a
                            className="btn"
                            href={`/documents/download/${v.id}?mode=view`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open
                          </a>{" "}
                          <a className="btn" href={`/documents/download/${v.id}`}>Download</a>
                          {v.status !== "ACCEPTED" && (admin || v.uploaded_by === user.id) && (
                            <ActionButton
                              action={deleteDocumentAction}
                              fields={{ document_id: v.id, request_id: id }}
                              label="Delete"
                              className="btn danger"
                              confirmText={`Delete version ${v.version} (${v.file_name})? The file is removed for good.`}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Nothing uploaded yet">
                {isClient ? "Upload the file to send it to your CA." : "The client hasn't sent this file yet."}
              </EmptyState>
            )}
          </Panel>

          <Panel title="History">
            <Timeline entries={(activityData ?? []) as unknown as Activity[]} viewerRole={user.role} />
          </Panel>
        </div>

        <div className="stack">
          {canReview && (
            <Panel title="Review">
              <ReviewForm documentId={latest.id} requestId={id} version={latest.version} />
            </Panel>
          )}

          {canUpload && (
            <Panel title={versions.length ? "Upload a new version" : "Upload"}>
              <UploadForm requestId={id} nextVersion={(latest?.version ?? 0) + 1} />
            </Panel>
          )}

          <Panel title="Details" padded>
            <dl className="info">
              {!isClient && (
                <>
                  <dt>Client</dt>
                  <dd><Link href={`/clients/${request.client_id}`}>{request.client?.name}</Link></dd>
                </>
              )}
              {request.description && (<><dt>Notes</dt><dd>{request.description}</dd></>)}
              {request.task && (
                <>
                  <dt>For task</dt>
                  <dd>{isClient ? request.task.title : <Link href={`/tasks/${request.task.id}`}>{request.task.title}</Link>}</dd>
                </>
              )}
              {request.financial_year && (<><dt>Financial year</dt><dd>{request.financial_year}</dd></>)}
              <dt>Requested</dt><dd>{formatDate(request.created_at)}</dd>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
