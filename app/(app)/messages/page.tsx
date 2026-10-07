import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MESSAGE_SELECT } from "@/lib/messages";
import type { Message } from "@/lib/types";
import { Avatar } from "./ConversationList";
import { MessageForm } from "./MessageForm";
import { Thread } from "./Thread";

export default async function MessagesPage() {
  const user = await requireUser(["ADMIN", "STAFF", "CLIENT"]);
  const supabase = await createClient();

  // ---- The firm: nothing chosen yet, so prompt for a conversation.
  if (user.role !== "CLIENT") {
    return (
      <div className="wa-blank">
        <span className="wa-blank-i" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
          </svg>
        </span>
        <h2>Your client conversations</h2>
        <p className="muted">
          Pick a client on the left to open the conversation, or search for them by name.
        </p>
        <p className="small muted">
          Everything you send here appears in that client&apos;s own portal. Files go through document requests.
        </p>
      </div>
    );
  }

  // ---- The client portal: a single conversation with the firm.
  const { data: link } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const clientId = link?.client_id as string | undefined;

  if (!clientId) {
    return (
      <div className="wa-blank">
        <h2>No conversation available</h2>
        <p className="muted">Please contact your CA firm directly.</p>
      </div>
    );
  }

  const [{ data: messageData }, { data: taskData }] = await Promise.all([
    // RLS keeps this to the signed-in client's own messages.
    supabase.from("messages").select(`${MESSAGE_SELECT}, task:tasks(id, title)`).order("created_at"),
    supabase
      .from("tasks")
      .select("id, title, period")
      .not("status", "in", "(COMPLETED,CANCELLED)")
      .order("due_date"),
  ]);

  return (
    <div className="wa-thread-pane">
      <header className="wa-top">
        <Avatar name="CA Firm" size={40} />
        <span className="wa-top-who">
          <b>Your CA firm</b>
          <span className="small muted">Usually replies within a working day</span>
        </span>
      </header>

      <div className="wa-scroll">
        <Thread messages={(messageData ?? []) as unknown as Message[]} user={user} />
      </div>

      <MessageForm
        clientId={clientId}
        tasks={(taskData ?? []) as { id: string; title: string; period: string }[]}
      />
    </div>
  );
}
