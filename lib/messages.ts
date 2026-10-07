export const MESSAGE_MAX = 2000;

export const MESSAGE_SELECT = "*, sender:users!messages_sender_id_fkey(id, name, role)";

/** Clients never see which staff member wrote; the firm speaks as one voice. */
export function senderLabel(
  sender: { id: string; name: string; role: string } | null,
  viewerId: string,
  viewerRole: string,
) {
  if (sender?.id === viewerId) return "You";
  if (viewerRole === "CLIENT") return "Your CA firm";
  return sender?.role === "CLIENT" ? `${sender.name} (client)` : sender?.name ?? "Someone";
}

export const isFromFirm = (role?: string | null) => role === "ADMIN" || role === "STAFF";
