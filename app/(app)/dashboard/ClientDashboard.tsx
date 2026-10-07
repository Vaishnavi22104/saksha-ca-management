import Link from "next/link";
import { EmptyState, Panel } from "@/components/ui";
import { ACTIVITY_SELECT, Timeline } from "@/components/Timeline";
import { Gauge } from "@/components/charts";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, plural } from "@/lib/format";
import { REQUEST_STATUS, needsClient } from "@/lib/documents";
import { MESSAGE_SELECT, isFromFirm } from "@/lib/messages";
import type { Activity, AppUser, DocumentRequestRow, Message, TaskRow } from "@/lib/types";
import { WorkList, groupWork } from "./work-groups";

const ICON = {
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 12h2M18 12h2M12 4v2M12 18v2",
  check: "M20 6 9 17l-5-5",
};

function Chip({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export async function ClientDashboard({ user }: { user: AppUser }) {
  const supabase = await createClient();
  // RLS limits every one of these queries to this client's own records.
  const [{ data: link }, { data: taskData }, { data: activityData }, { data: requestData }, { data: messageData }] =
    await Promise.all([
      supabase.from("client_users").select("client:clients(name)").eq("user_id", user.id).maybeSingle(),
      supabase.from("tasks").select("*, service:services(name)"),
      supabase.from("activity_logs").select(ACTIVITY_SELECT).order("created_at", { ascending: false }).limit(6),
      supabase
        .from("document_requests")
        .select("*, client:clients(name), task:tasks!document_requests_task_id_fkey(id, title)")
        .not("status", "in", "(ACCEPTED,CANCELLED)")
        .order("due_date", { nullsFirst: false }),
      supabase.from("messages").select(MESSAGE_SELECT).order("created_at", { ascending: false }).limit(3),
    ]);

  const client = link?.client as unknown as { name: string } | null;
  const tasks = (taskData ?? []) as unknown as TaskRow[];
  const waiting = tasks.filter((t) => t.status === "WAITING_FOR_CLIENT");
  const requests = (requestData ?? []) as unknown as DocumentRequestRow[];
  const documentsNeeded = requests.filter((r) => needsClient(r.status));
  const inReview = requests.filter((r) => r.status === "UPLOADED" || r.status === "UNDER_REVIEW");
  const messages = (messageData ?? []) as unknown as Message[];

  const done = tasks.filter((t) => t.status === "COMPLETED").length;
  const inProgress = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED").length;

  // The single clearest next action for the client.
  const nextRequest = documentsNeeded[0];

  return (
    <>
      <div className="page-toolbar">
        <p className="greeting" style={{ margin: 0 }}>Welcome, {client?.name}</p>
        <div className="pt-actions">
          <Link className="pt-btn" href="/documents">My documents</Link>
          <Link className="pt-btn" href="/messages">Message my CA</Link>
        </div>
      </div>

      <div className="dash-grid">
        <section className="hero-card">
          <div className="hero-card-h">
            <h2>Where your work stands</h2>
            <p>
              {documentsNeeded.length || waiting.length
                ? "Your CA is waiting on a few things from you."
                : "Your CA has everything they need from you right now."}
            </p>
          </div>
          <div className="ledger">
            <Link href="/documents" className={documentsNeeded.length ? "alert" : undefined}>
              <span className="k"><Chip d={ICON.upload} />Upload</span>
              <span className="n">{documentsNeeded.length}</span><span className="l">Documents needed</span>
            </Link>
            <Link href="/documents"><span className="k"><Chip d={ICON.eye} />Checking</span><span className="n">{inReview.length}</span><span className="l">With your CA</span></Link>
            <Link href="/work"><span className="k"><Chip d={ICON.gear} />Active</span><span className="n">{inProgress}</span><span className="l">Work in progress</span></Link>
            <Link href="/work"><span className="k"><Chip d={ICON.check} />Done</span><span className="n">{done}</span><span className="l">Completed</span></Link>
          </div>
        </section>

        <aside className="next-card">
          <span className="next-tag">What we need from you</span>
          {nextRequest ? (
            <>
              <h3>{nextRequest.title}</h3>
              <p className="next-sub">
                {nextRequest.period ? nextRequest.period : "No period given"}
                {nextRequest.description ? ` · ${nextRequest.description}` : ""}
              </p>
              {nextRequest.due_date && (
                <p className={`next-due ${new Date(nextRequest.due_date) < new Date() ? "late" : ""}`}>
                  {new Date(nextRequest.due_date) < new Date() ? "Was due " : "Please send by "}
                  {formatDate(nextRequest.due_date)}
                </p>
              )}
              <Link href={`/documents/${nextRequest.id}`} className="btn primary block">Upload this document</Link>
            </>
          ) : (
            <>
              <h3>Nothing pending</h3>
              <p className="next-sub">We&apos;ll let you know here as soon as your CA needs something.</p>
              <Link href="/messages" className="btn block">Ask a question</Link>
            </>
          )}
        </aside>

        <div className="dash-pair">
          <Panel title="Your progress" padded>
            <Gauge done={done} total={tasks.length} caption="Work completed for you" />
          </Panel>
          <Panel title="Latest message" padded>
            {messages.length ? (
              <ul className="list" style={{ margin: "-6px -18px" }}>
                {messages.map((mm) => (
                  <li key={mm.id}>
                    <span>
                      {mm.message.length > 70 ? `${mm.message.slice(0, 70)}…` : mm.message}
                      <span className="sub">
                        {isFromFirm(mm.sender?.role) ? "Your CA firm" : "You"} · {formatDateTime(mm.created_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No messages yet"><Link href="/messages">Ask your CA firm a question.</Link></EmptyState>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid2">
        <div className="stack">
          <Panel title="Documents" action={<Link className="small" href="/documents">All documents</Link>}>
            {requests.length ? (
              <ul className="list">
                {requests.map((r) => (
                  <li key={r.id}>
                    <span>
                      <Link className="rowlink" href={`/documents/${r.id}`}>{r.title}</Link>
                      <span className="sub">
                        {r.period ? `${r.period}` : "No period"}
                        {r.due_date ? ` · by ${formatDate(r.due_date)}` : ""}
                      </span>
                    </span>
                    <span className={`badge ${REQUEST_STATUS[r.status].tone ? "b-" + REQUEST_STATUS[r.status].tone : ""}`}>
                      {r.status === "REQUESTED" ? "Upload needed" : REQUEST_STATUS[r.status].label}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No documents outstanding">Files your CA asks for will appear here.</EmptyState>
            )}
          </Panel>

          <Panel title="Work status" action={<Link className="small" href="/work">See all work</Link>}>
            <WorkList groups={groupWork(tasks)} linkClients={false} />
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Needed from you">
            {waiting.length ? (
              <ul className="list">
                {waiting.map((t) => (
                  <li key={t.id}>
                    <span>
                      {t.title}
                      <span className="sub">{t.service?.name}, {t.period} · due {formatDate(t.due_date)}</span>
                    </span>
                    <span className="badge b-amber">Waiting for you</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="You&apos;re all caught up">Requests from your CA will appear here.</EmptyState>
            )}
          </Panel>

          <Panel title="Recent updates">
            <Timeline entries={(activityData ?? []) as unknown as Activity[]} viewerRole="CLIENT" />
          </Panel>
        </div>
      </div>
    </>
  );
}
