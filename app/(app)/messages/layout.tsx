import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MESSAGE_SELECT, isFromFirm } from "@/lib/messages";
import type { Message } from "@/lib/types";
import { ConversationList, type Conversation } from "./ConversationList";

export const dynamic = "force-dynamic";

/**
 * The chat list lives in the layout rather than the page, so it stays put
 * while you move between conversations — only the thread beside it is
 * fetched again. A client has a single conversation, so they get the
 * thread on its own.
 */
export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["ADMIN", "STAFF", "CLIENT"]);
  const supabase = await createClient();

  // A client talks to one place only, but they still get the same list,
  // so the screen never looks like a chat you cannot back out of.
  if (user.role === "CLIENT") {
    const [{ data: link }, { data: lastData }] = await Promise.all([
      supabase.from("client_users").select("client_id").eq("user_id", user.id).maybeSingle(),
      supabase.from("messages").select(MESSAGE_SELECT).order("created_at", { ascending: false }).limit(1),
    ]);
    const clientId = link?.client_id as string | undefined;
    if (!clientId) return <div className="wa solo">{children}</div>;

    const last = ((lastData ?? []) as unknown as Message[])[0];
    const mine: Conversation = {
      id: clientId,
      name: "Your CA firm",
      avatarName: "CA Firm",
      href: "/messages",
      text: last ? (last.message.length > 64 ? `${last.message.slice(0, 64)}…` : last.message) : undefined,
      // A tick means "you sent this", which for a client means their own message.
      fromFirm: last ? !isFromFirm(last.sender?.role) : undefined,
      at: last?.created_at,
    };

    return (
      <div className="wa">
        <ConversationList items={[mine]} heading="Messages" activeId={clientId} />
        <div className="wa-main">{children}</div>
      </div>
    );
  }

  const [{ data: clientData }, { data: messageData }] = await Promise.all([
    supabase.from("clients").select("id, name, status").eq("status", "ACTIVE").order("name"),
    // RLS already limits this to clients this user may see.
    supabase.from("messages").select(MESSAGE_SELECT).order("created_at", { ascending: false }).limit(400),
  ]);

  const clients = (clientData ?? []) as { id: string; name: string }[];
  const messages = (messageData ?? []) as unknown as Message[];

  // Newest first, so the first message seen for a client is their latest.
  const latest = new Map<string, Message>();
  for (const m of messages) if (!latest.has(m.client_id)) latest.set(m.client_id, m);

  const items: Conversation[] = clients
    .map((c) => {
      const last = latest.get(c.id);
      if (!last) return { id: c.id, name: c.name };
      const fromFirm = isFromFirm(last.sender?.role);
      return {
        id: c.id,
        name: c.name,
        text: last.message.length > 64 ? `${last.message.slice(0, 64)}…` : last.message,
        fromFirm,
        at: last.created_at,
        awaiting: !fromFirm,
      };
    })
    // Conversations with recent activity float to the top; the rest follow
    // alphabetically, as they already are.
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  return (
    <div className="wa">
      <ConversationList items={items} heading="Chats" />
      <div className="wa-main">{children}</div>
    </div>
  );
}
