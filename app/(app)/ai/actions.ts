"use server";

import { revalidatePath } from "next/cache";
import { friendlyError, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { handleChatMessage, type ChatTaskRow, type ToolName } from "@/lib/ai-chat";
import { AI_FALLBACK, askModel } from "@/lib/ai";
import { collectClientFacts, collectFirmFacts } from "@/lib/ai-context";
import {
  describeFilters,
  extractJson,
  filterPrompt,
  loadVocabulary,
  parseWithRules,
  runTaskSearch,
  validateFilters,
  type SearchFilters,
} from "@/lib/ai-search";
import type { ActionState, TaskRow } from "@/lib/types";

export interface AiState extends ActionState {
  answer?: string;
  facts?: string[];
  notice?: string;
  question?: string;
}

const TASKS = {
  summary:
    "Write a short daily summary for the CA: what needs attention first, what is at risk, and what is simply progressing. " +
    "Three or four sentences. Name clients and tasks exactly as written in the records.",
  documents:
    "List what is still missing from clients and what the firm needs to review, grouped by client. " +
    "Say plainly if nothing is outstanding.",
  workload:
    "Describe how work is spread across the staff: who is carrying the most, who has overdue work, and whether anything is unassigned. " +
    "Do not suggest anyone's performance is good or bad.",
} as const;

export type SummaryKind = keyof typeof TASKS;

/** One of the three fixed summaries, built from firm records only. */
export async function summariseAction(_prev: AiState, formData: FormData): Promise<AiState> {
  await requireUser(["ADMIN"]);
  const kind = String(formData.get("kind") ?? "summary") as SummaryKind;
  const instruction = TASKS[kind] ?? TASKS.summary;

  const facts = await collectFirmFacts();
  const prompt = `${instruction}\n\nSTRUCTURED RECORDS\n${facts.lines.join("\n")}`;
  const result = await askModel(prompt);

  if (!result.ok) {
    return { facts: facts.lines, notice: `${AI_FALLBACK[result.reason]} (${result.detail})` };
  }
  return { ok: true, answer: result.text, facts: facts.lines };
}

/** A reminder the CA reads, edits and sends themselves. Nothing is sent automatically. */
export async function reminderAction(_prev: AiState, formData: FormData): Promise<AiState> {
  await requireUser(["ADMIN"]);
  const clientId = String(formData.get("client_id") ?? "");
  if (!clientId) return { error: "Choose a client first." };

  const context = await collectClientFacts(clientId);
  if (!context) return { error: "Client not found." };
  if (!context.owed.length && !context.blocked.length) {
    return {
      notice: `${context.client.name} owes nothing right now, so there is nothing to remind them about.`,
      facts: context.lines,
    };
  }

  const prompt =
    "Draft a short, polite reminder message from the CA firm to this client, listing only what is outstanding. " +
    "No greeting fluff, no deadlines that are not in the records, no tax advice. Under 120 words. " +
    "The CA will read and send it themselves.\n\nSTRUCTURED RECORDS\n" +
    context.lines.join("\n");

  const result = await askModel(prompt);
  if (!result.ok) {
    return { facts: context.lines, notice: `${AI_FALLBACK[result.reason]} (${result.detail})` };
  }
  return { ok: true, answer: result.text, facts: context.lines };
}

/** Free-text question, answered strictly from the same structured records. */
export async function askAction(_prev: AiState, formData: FormData): Promise<AiState> {
  await requireUser(["ADMIN"]);
  const question = String(formData.get("question") ?? "").trim().slice(0, 300);
  if (question.length < 3) return { error: "Ask a question about your workflow data." };

  const facts = await collectFirmFacts();
  const prompt =
    `Answer this question using only the records below. If they do not contain the answer, say which record would be needed.\n\n` +
    `QUESTION\n${question}\n\nSTRUCTURED RECORDS\n${facts.lines.join("\n")}`;

  const result = await askModel(prompt);
  if (!result.ok) {
    return { facts: facts.lines, question, notice: `${AI_FALLBACK[result.reason]} (${result.detail})` };
  }
  return { ok: true, answer: result.text, facts: facts.lines, question };
}


export interface SearchState extends ActionState {
  question?: string;
  applied?: string[];
  dropped?: string[];
  rows?: TaskRow[];
  readBy?: "model" | "rules";
  notice?: string;
}

/**
 * Natural-language search. The model only proposes filters; this action
 * validates them and runs the query itself. When no model answers, the
 * same question is read with keyword rules, so the feature never dies.
 */
export async function searchAction(_prev: SearchState, formData: FormData): Promise<SearchState> {
  await requireUser(["ADMIN", "STAFF"]);
  const question = String(formData.get("query") ?? "").trim().slice(0, 200);
  if (question.length < 3) return { error: "Describe what you are looking for." };

  const vocabulary = await loadVocabulary();
  let filters: SearchFilters = {};
  let dropped: string[] = [];
  let readBy: "model" | "rules" = "model";
  let notice: string | undefined;

  const result = await askModel(filterPrompt(question, vocabulary), { json: true });
  if (result.ok) {
    const validated = validateFilters(extractJson(result.text), vocabulary);
    filters = validated.filters;
    dropped = validated.dropped;
  }

  // No model, or a model that produced nothing usable: read it ourselves.
  if (!result.ok || Object.keys(filters).length === 0) {
    const fallback = parseWithRules(question, vocabulary);
    if (!result.ok) {
      readBy = "rules";
      notice = `${AI_FALLBACK[result.reason]} The question was read with keyword rules instead.`;
      filters = fallback;
    } else if (Object.keys(fallback).length > 0) {
      readBy = "rules";
      notice = "The model returned no usable filters, so the question was read with keyword rules.";
      filters = fallback;
    }
  }

  if (Object.keys(filters).length === 0) {
    return {
      question,
      readBy,
      notice: notice ?? "That question did not match anything searchable. Try naming a client, service, status or a number of days.",
      applied: [],
      dropped,
      rows: [],
    };
  }

  // "What is the GST rate?" is a question, not a filter. The keyword rules
  // would quietly turn it into a service filter, so say what happened instead.
  const looksLikeAQuestion = /^(what|how|why|when|who|should|can|is|are|does|do)\b/i.test(question);
  const onlyWeakFilters = Object.keys(filters).every((key) => key === "service" || key === "client");
  if (readBy === "rules" && looksLikeAQuestion && onlyWeakFilters) {
    notice =
      "That reads like a question rather than a search. Showing the closest matching work — " +
      "for questions, use \u201cAsk about your workflow data\u201d below.";
  }

  const rows = await runTaskSearch(filters);
  return { ok: true, question, readBy, notice, applied: describeFilters(filters), dropped, rows };
}

// ---------------------------------------------------------------------
// Chat: one box, the tools above underneath it.
// ---------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  tool?: string | null;
  meta?: {
    client?: string;
    rows?: ChatTaskRow[];
    applied?: string[];
    dropped?: string[];
    routedBy?: "model" | "rules";
    degraded?: string;
    /** Monitoring, stored with every answer. */
    promptVersion?: number;
    models?: string[];
    ms?: number;
    usedFallback?: boolean;
  };
  created_at: string;
}

export interface ChatState extends ActionState {
  conversationId?: string;
  messages?: ChatMessage[];
}

/**
 * One turn of the conversation: save what was asked, route it to a tool,
 * run that tool in our own code, save the answer with the data it used.
 */
export async function sendChatAction(_prev: ChatState, formData: FormData): Promise<ChatState> {
  await requireUser(["ADMIN"]);
  const message = String(formData.get("message") ?? "").trim().slice(0, 500);
  let conversationId = String(formData.get("conversation_id") ?? "");
  if (message.length < 2) return { error: "Type a message first." };

  const supabase = await createClient();

  if (!conversationId) {
    const { data, error } = await supabase.rpc("start_ai_conversation", { p_title: message });
    if (error || !data) return { error: friendlyError(error, "The conversation could not be started.") };
    conversationId = data as string;
  }

  const { error: userError } = await supabase.rpc("append_ai_message", {
    p_conversation_id: conversationId,
    p_role: "USER",
    p_content: message,
    p_tool: null,
    p_meta: {},
  });
  if (userError) return { error: friendlyError(userError, "Your message could not be saved.") };

  // Context for follow-ups: the recent turns, plus which tool last ran and
  // who it was about, so "longer" or "in 200 words" edits the same answer.
  const { data: recent } = await supabase
    .from("ai_messages")
    .select("role, content, tool, meta")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(8);
  const recentRows = (recent ?? []) as { role: string; content: string; tool: string | null; meta: { client?: string } | null }[];
  const history = recentRows
    .slice()
    .reverse()
    .map((m) => `${m.role === "USER" ? "User" : "Assistant"}: ${m.content.slice(0, 300)}`);
  const lastAssistant = recentRows.find((m) => m.role === "ASSISTANT" && m.tool);

  // A thrown error here would break the whole page, so it becomes an answer.
  let outcome;
  try {
    outcome = await handleChatMessage(message, history, {
      lastTool: (lastAssistant?.tool ?? undefined) as ToolName | undefined,
      lastClient: lastAssistant?.meta?.client,
    });
  } catch (error) {
    console.error("AI chat failed:", error);
    return {
      error: "The assistant could not answer that. Your message was saved; please try again.",
      conversationId,
    };
  }

  const meta = {
    ...(outcome.client ? { client: outcome.client } : {}),
    rows: outcome.rows ?? [],
    applied: outcome.applied ?? [],
    dropped: outcome.dropped ?? [],
    routedBy: outcome.routedBy,
    ...(outcome.degraded ? { degraded: outcome.degraded } : {}),
    ...(outcome.telemetry
      ? {
          promptVersion: outcome.telemetry.promptVersion,
          models: outcome.telemetry.models,
          ms: outcome.telemetry.ms,
          usedFallback: outcome.telemetry.usedFallback,
        }
      : {}),
  };

  // One line per answered message, so slow days and fallback days show up
  // in the server log without any extra service.
  console.info(
    `[ai] tool=${outcome.tool} routedBy=${outcome.routedBy} ms=${outcome.telemetry?.ms ?? 0} ` +
      `models=${outcome.telemetry?.models.join(",") || "none"} promptV=${outcome.telemetry?.promptVersion ?? 0}` +
      (outcome.telemetry?.usedFallback ? " fallback=yes" : ""),
  );
  const answer = outcome.answer?.trim() || "I could not produce an answer for that.";
  await supabase.rpc("append_ai_message", {
    p_conversation_id: conversationId,
    p_role: "ASSISTANT",
    p_content: answer,
    p_tool: outcome.tool,
    p_meta: meta,
  });

  return {
    ok: true,
    conversationId,
    messages: [
      { id: `${Date.now()}-u`, role: "USER", content: message, created_at: new Date().toISOString() },
      {
        id: `${Date.now()}-a`,
        role: "ASSISTANT",
        content: answer,
        tool: outcome.tool,
        meta,
        created_at: new Date().toISOString(),
      },
    ],
  };
}

/** Removes the stored conversation. The CA asked for it to go, so it goes. */
export async function clearChatAction(_prev: ChatState, formData: FormData): Promise<ChatState> {
  await requireUser(["ADMIN"]);
  const conversationId = String(formData.get("conversation_id") ?? "");
  if (conversationId) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_ai_conversation", { p_conversation_id: conversationId });
    if (error) return { error: friendlyError(error, "The conversation could not be cleared.") };
  }
  revalidatePath("/ai");
  return { ok: true, conversationId: undefined, messages: [] };
}
