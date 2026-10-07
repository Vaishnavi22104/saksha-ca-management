import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { aiConfig, modelStatus } from "@/lib/ai";
import { collectFirmFacts } from "@/lib/ai-context";
import { AiChat, type ConversationSummary } from "./AiChat";
import type { ChatMessage } from "./actions";

// The provider is checked on every visit, so the status shown is current.
export const dynamic = "force-dynamic";

/**
 * Reachability of the model provider. It is a network call to someone
 * else's server, so it is streamed in after the page rather than being
 * allowed to hold the chat back.
 */
async function ProviderBanner() {
  const status = await modelStatus();
  if (status.up) return null;
  return (
    <div className="notice chat-banner" role="status">
      <span className="strong">The assistant is offline. </span>
      Searches and summaries still work from your records; written replies are unavailable until it is back.
    </div>
  );
}

export default async function AiPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  await requireUser(["ADMIN"]);
  const { c: openConversation, q: prefill } = await searchParams;
  const supabase = await createClient();

  const [facts, { data: conversationData }] = await Promise.all([
    collectFirmFacts(),
    // RLS: only this user's own conversations exist as far as the database
    // is concerned, so this list is always theirs alone.
    supabase
      .from("ai_conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);

  const conversations = (conversationData ?? []) as unknown as ConversationSummary[];
  // ?c=<id> opens an older conversation; no parameter starts a fresh one.
  const conversationId =
    openConversation && conversations.some((x) => x.id === openConversation) ? openConversation : undefined;
  const { data: messageData } = conversationId
    ? await supabase
        .from("ai_messages")
        .select("id, role, content, tool, meta, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at")
    : { data: [] };

  const config = aiConfig();
  // What the person using the app needs to know, not how it is wired.
  const provider = config.local
    ? "Answers come from your firm's own records. Nothing leaves this machine."
    : "Answers come from your firm's own records. No client files or messages are sent.";

  return (
    <div className="chat-page">
      <Suspense fallback={null}>
        <ProviderBanner />
      </Suspense>

      {/*
        The key ties the chat pane to the conversation in the address bar:
        opening a different one rebuilds the pane instead of leaving the
        previous conversation's messages sitting in component state.
      */}
      <AiChat
        key={conversationId ?? "new"}
        conversationId={conversationId}
        conversations={conversations}
        initialMessages={(messageData ?? []) as unknown as ChatMessage[]}
        counts={facts.counts}
        initialDraft={prefill?.slice(0, 500)}
        provider={provider}
      />
    </div>
  );
}
