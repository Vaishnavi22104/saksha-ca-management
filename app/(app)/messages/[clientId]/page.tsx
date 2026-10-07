import Link from "next/link";
import { AccessDenied } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MESSAGE_SELECT } from "@/lib/messages";
import type { Client, Message } from "@/lib/types";
import { Avatar } from "../ConversationList";
import { MessageForm } from "../MessageForm";
import { Thread } from "../Thread";

export default async function ClientThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const user = await requireUser(["ADMIN", "STAFF"]);
  const { clientId } = await params;
  const { task } = await searchParams;
  const supabase = await createClient();

  // RLS: a client this user may not see is simply not found.
  const { data: clientData } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
  if (!clientData) return <AccessDenied />;
  const client = clientData as Client;

  const [{ data: messageData }, { data: taskData }] = await Promise.all([
    supabase
      .from("messages")
      .select(`${MESSAGE_SELECT}, task:tasks(id, title)`)
      .eq("client_id", clientId)
      .order("created_at"),
    supabase
      .from("tasks")
      .select("id, title, period")
      .eq("client_id", clientId)
      .not("status", "in", "(COMPLETED,CANCELLED)")
      .order("due_date"),
  ]);

  return (
    <div className="wa-thread-pane">
      <header className="wa-top">
        {/* Only shown on a phone, where the list is hidden behind it. */}
        <Link className="wa-back" href="/messages" aria-label="Back to all chats">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <Avatar name={client.name} size={40} />
        <span className="wa-top-who">
          <b>{client.name}</b>
          <span className="small muted">
            {client.status === "ACTIVE"
              ? "Sees these messages in their portal"
              : "Inactive client — no new messages can be sent"}
          </span>
        </span>
        <Link className="btn wa-top-btn" href={`/clients/${clientId}`}>Open client</Link>
      </header>

      <div className="wa-scroll">
        <Thread messages={(messageData ?? []) as unknown as Message[]} user={user} linkTasks />
      </div>

      {client.status === "ACTIVE" ? (
        <MessageForm
          clientId={clientId}
          tasks={(taskData ?? []) as { id: string; title: string; period: string }[]}
          defaultTaskId={task}
        />
      ) : (
        <p className="wa-closed small muted">
          This client is inactive. Reactivate them from their profile to carry on the conversation.
        </p>
      )}
    </div>
  );
}
