import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import type { Role } from "@/lib/types";

const MODULES: Record<string, { title: string; date: string; roles: Role[]; items: string[] }> = {
  workflows: {
    title: "Workflows", date: "22–23 Sep", roles: ["ADMIN"],
    items: ["Template list with ordered steps", "Mark steps that need a document", "Generate a workflow run for a client and period", "Warn before duplicating the same cycle"],
  },
  documents: {
    title: "Documents", date: "24 Sep", roles: ["ADMIN", "STAFF", "CLIENT"],
    items: ["Document requests linked to tasks", "Private uploads with version history", "Accept or reject with a required reason", "Client re-upload against the same request"],
  },
  messages: {
    title: "Messages", date: "25 Sep", roles: ["ADMIN", "STAFF", "CLIENT"],
    items: ["CA and client conversation per client", "Optional link to a specific task"],
  },
  ai: {
    title: "AI assistant", date: "30 Sep – 2 Oct", roles: ["ADMIN"],
    items: ["Daily summary from workflow data only", "Missing-document and workload summaries", "Reminder drafts that a person sends", "Clear fallback when the local model is offline"],
  },
};

export default async function UpcomingModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const m = MODULES[module];
  if (!m) notFound();
  await requireUser(m.roles);

  return (
    <>
      <PageHeader title={m.title} description={`Planned for ${m.date}`} />
      <div className="narrow wip">
        <Panel padded>
          <div className="notice">This module isn&apos;t built yet. Sign-in, clients, staff, tasks and activity are working now.</div>
          <span className="strong">What this module will do</span>
          <ol>{m.items.map((i) => <li key={i}>{i}</li>)}</ol>
        </Panel>
      </div>
    </>
  );
}
