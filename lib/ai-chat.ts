import "server-only";
import { z } from "zod";
import { AsyncLocalStorage } from "node:async_hooks";
import { askModel as askModelRaw, PROMPT_VERSION } from "@/lib/ai";
import { collectClientFacts, collectFirmFacts } from "@/lib/ai-context";
import {
  describeFilters,
  extractJson,
  loadVocabulary,
  parseWithRules,
  runTaskSearch,
  searchFilterSchema,
  validateFilters,
  type FirmVocabulary,
} from "@/lib/ai-search";

/**
 * One chat, four controlled tools.
 *
 *   message -> route -> run the tool in OUR code -> model writes the reply
 *
 * The model chooses WHICH tool and with what arguments; it never reaches
 * the database, never writes SQL and never receives more than the tool's
 * own output. Every argument is validated against the firm's real lists
 * before anything runs, and if the model is unavailable the router falls
 * back to keyword rules so the chat still works.
 */

export const TOOLS = {
  converse:
    "Greetings, thanks, small talk, questions about what you can do, and anything too vague or mistyped to act on. " +
    "Reply like a helpful colleague and offer what you can actually do.",
  search_tasks: "Find tasks matching filters (client, service, status, due window, unassigned).",
  summarise: "Summarise the whole firm: daily overview, missing documents, or team workload.",
  draft_reminder: "Draft a reminder to one client about what they still owe.",
  answer_from_records: "Answer a question in words, using the firm's records.",
} as const;

export type ToolName = keyof typeof TOOLS;

export const TOOL_LABEL: Record<ToolName, string> = {
  converse: "Assistant",
  search_tasks: "Task search",
  summarise: "Firm summary",
  draft_reminder: "Reminder draft",
  answer_from_records: "Answered from records",
};

const routeSchema = z.object({
  tool: z.enum(["converse", "search_tasks", "summarise", "draft_reminder", "answer_from_records"]),
  filters: searchFilterSchema.optional(),
  summary_kind: z.enum(["daily", "documents", "workload"]).optional(),
  client: z.string().max(80).optional(),
});

export type Route = z.infer<typeof routeSchema>;

/** Rows kept with the answer, so a reopened conversation still shows its table. */
export interface ChatTaskRow {
  id: string;
  title: string;
  client: string;
  service: string;
  period: string;
  due_date: string;
  status: string;
  assignee: string | null;
}

export interface ToolOutcome {
  tool: ToolName;
  answer: string;
  client?: string;
  rows?: ChatTaskRow[];
  applied?: string[];
  dropped?: string[];
  routedBy: "model" | "rules";
  degraded?: string;
  /** Monitoring: what answered, how long it took, which prompt wrote it. */
  telemetry?: {
    promptVersion: number;
    /** Every model used for this turn — routing plus the tool's own call. */
    models: string[];
    /** Wall time for the whole turn, in milliseconds. */
    ms: number;
    calls: number;
    usedFallback: boolean;
  };
}

/**
 * Per-turn record of model calls. AsyncLocalStorage keeps two users'
 * simultaneous messages from counting each other's calls.
 */
interface TurnTrace { models: string[]; calls: number; usedFallback: boolean }
const trace = new AsyncLocalStorage<TurnTrace>();

/** Same call as lib/ai's askModel, but noted down for the monitoring line. */
async function askModel(...args: Parameters<typeof askModelRaw>) {
  const result = await askModelRaw(...args);
  const current = trace.getStore();
  if (current) {
    current.calls += 1;
    if (result.model && !current.models.includes(result.model)) current.models.push(result.model);
    if (result.usedFallback) current.usedFallback = true;
  }
  return result;
}

function routingPrompt(message: string, vocabulary: FirmVocabulary, history: string[]) {
  return [
    "Choose ONE tool for the user's message and reply with a single JSON object, nothing else.",
    "",
    "Tools:",
    ...Object.entries(TOOLS).map(([name, description]) => `  ${name}: ${description}`),
    "",
    "JSON shape:",
    '  {"tool": "<tool name>",',
    '   "filters": {"status": "OPEN|OVERDUE|TODO|IN_PROGRESS|WAITING_FOR_CLIENT|UNDER_REVIEW|COMPLETED",',
    '               "service": "...", "client": "...", "assignee": "...", "period": "...",',
    '               "due_within_days": 7, "unassigned": true, "needs_document": true},',
    '   "summary_kind": "daily|documents|workload",',
    '   "client": "..." }',
    "",
    "Only include the keys the message actually implies.",
    `Valid services: ${vocabulary.services.join(" | ") || "(none)"}`,
    `Valid clients: ${vocabulary.clients.join(" | ") || "(none)"}`,
    `Valid staff: ${vocabulary.staff.join(" | ") || "(none)"}`,
    "Never invent a name that is not listed. Omit the key instead.",
    "Use search_tasks when the user wants a list of work; answer_from_records when they want an explanation.",
    "Use converse for hello, thanks, chit-chat, 'what can you do', or anything too vague to act on.",
    "The user types quickly and misspells words. Read past spelling mistakes and judge what they meant.",
    "",
    history.length ? `RECENT CONVERSATION\n${history.slice(-4).join("\n")}` : "",
    `MESSAGE: ${message}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Keyword routing, used when no model answers or its answer is unusable. */
export function routeWithRules(message: string, vocabulary: FirmVocabulary): Route {
  const m = message.toLowerCase();

  // Hello, thanks, "what can you do", or one vague word: talk, don't search.
  if (/^(hi|hii+|hey+|hello|helo|yo|good (morning|afternoon|evening)|thanks?|thank you|thx|ok|okay|bye)\b/.test(m)) {
    return { tool: "converse" };
  }
  if (/(what can you do|who are you|how do you work|help me|what do you do)/.test(m)) {
    return { tool: "converse" };
  }

  if (/(remind|chase|follow up|nudge)/.test(m)) {
    const client = vocabulary.clients.find((c) => m.includes(c.toLowerCase()));
    if (client) return { tool: "draft_reminder", client };
  }
  if (/(workload|who is busy|team|capacity)/.test(m)) return { tool: "summarise", summary_kind: "workload" };
  if (/(missing document|documents? (needed|owed|outstanding|awaited))/.test(m)) {
    return { tool: "summarise", summary_kind: "documents" };
  }
  if (/(summary|summarise|summarize|overview|brief|what.*today)/.test(m)) {
    return { tool: "summarise", summary_kind: "daily" };
  }

  const filters = parseWithRules(message, vocabulary);
  const listy = /(show|list|find|which tasks|what tasks|search|filter)/.test(m);
  if (Object.keys(filters).length > 0 && (listy || !/^(what|why|how|should|is|are|who)/.test(m))) {
    return { tool: "search_tasks", filters };
  }
  return { tool: "answer_from_records" };
}

const SUMMARY_INSTRUCTION = {
  daily:
    "Write a short daily summary for the CA: what needs attention first, what is at risk, what is simply progressing. " +
    "Three or four sentences.",
  documents:
    "List what is still missing from clients and what the firm needs to review, grouped by client. " +
    "Say plainly if nothing is outstanding.",
  workload:
    "Describe how work is spread across the staff: who is carrying the most, who has overdue work, and whether anything " +
    "is unassigned. Do not judge anyone's performance.",
} as const;

const RECORDS_HEADER = "STRUCTURED RECORDS";

/**
 * "Longer", "in 200 words", "make it formal" are edits to the previous
 * answer, not new requests. They keep the last tool and its subject.
 */
const FOLLOW_UP =
  /^(longer|shorter|more detail|less detail|expand|shorten|again|rewrite|redo|in \d+ words|make it|more formal|less formal|simpler|in hindi|add |remove )/i;

export interface ChatContext {
  lastTool?: ToolName;
  lastClient?: string;
}

/**
 * Public entry point: runs one turn and attaches the monitoring record.
 * Every answer therefore carries the model, the latency and the prompt
 * version that produced it — which is what makes a bad answer months from
 * now something you can explain rather than guess at.
 */
export async function handleChatMessage(
  message: string,
  history: string[],
  context: ChatContext = {},
): Promise<ToolOutcome> {
  const record: TurnTrace = { models: [], calls: 0, usedFallback: false };
  const started = Date.now();
  const outcome = await trace.run(record, () => runChatMessage(message, history, context));
  return {
    ...outcome,
    telemetry: {
      promptVersion: PROMPT_VERSION,
      models: record.models,
      ms: Date.now() - started,
      calls: record.calls,
      usedFallback: record.usedFallback,
    },
  };
}

/** Routes one message and runs the chosen tool. Never throws. */
async function runChatMessage(
  message: string,
  history: string[],
  context: ChatContext = {},
): Promise<ToolOutcome> {
  const vocabulary = await loadVocabulary();

  let route: Route | null = null;
  let routedBy: "model" | "rules" = "model";
  let degraded: string | undefined;

  const isFollowUp = FOLLOW_UP.test(message.trim()) && !!context.lastTool;
  if (isFollowUp) {
    route = { tool: context.lastTool!, client: context.lastClient };
    routedBy = "rules";
  }

  if (!route) {
    const routing = await askModel(routingPrompt(message, vocabulary, history), { json: true });
    if (routing.ok) {
      const parsed = routeSchema.safeParse(extractJson(routing.text));
      if (parsed.success) route = parsed.data;
    } else {
      degraded = routing.detail;
    }
  }
  if (!route) {
    route = routeWithRules(message, vocabulary);
    routedBy = "rules";
  }

  // ---- converse: an ordinary reply, still grounded in real numbers
  if (route.tool === "converse") {
    const facts = await collectFirmFacts();
    const counts = facts.counts;
    const snapshot =
      `Right now: ${counts.openTasks} open tasks, ${counts.overdue} overdue, ${counts.awaitingReview} awaiting your ` +
      `review, ${counts.documentsAwaited} documents awaited from clients, ${counts.activeWorkflows} active workflows.`;

    const result = await askModel(
      [
        "You are the assistant inside a chartered accountancy firm's practice management app.",
        "Reply to this message the way a helpful colleague would: warm, brief, natural. One or two sentences.",
        "If the message is a greeting or small talk, greet back and say what you can help with.",
        "If it is unclear or misspelled, say what you think they meant and offer the closest thing you can do.",
        "You can: search their tasks, summarise the firm's day, list missing client documents, describe team",
        "workload, and draft client reminders. You cannot give tax, accounting or legal advice, and you cannot",
        "see uploaded files or client messages. Never invent client names or numbers.",
        "Mention a number from the snapshot only if it is relevant to what they said.",
        "",
        `CURRENT SNAPSHOT: ${snapshot}`,
        history.length ? `\nEARLIER IN THIS CONVERSATION\n${history.slice(-4).join("\n")}` : "",
        `\nMESSAGE: ${message}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );

    if (!result.ok) {
      return {
        tool: "converse",
        routedBy,
        degraded: result.detail,
        answer:
          "I can search your tasks, summarise the day, list documents clients still owe, or draft a reminder. " +
          snapshot,
      };
    }
    return { tool: "converse", answer: result.text, routedBy, degraded };
  }

  // ---- search_tasks
  if (route.tool === "search_tasks") {
    const { filters, dropped } = validateFilters(route.filters ?? {}, vocabulary);
    const effective = Object.keys(filters).length ? filters : parseWithRules(message, vocabulary);

    if (!Object.keys(effective).length) {
      return {
        tool: "search_tasks",
        routedBy,
        dropped,
        answer:
          "I'm not sure what to search for there. Tell me a client, a service like GST or TDS, a status such as " +
          "overdue, or a time frame like \"this week\" — for example \"overdue GST work\".",
      };
    }

    const found = await runTaskSearch(effective);
    const rows: ChatTaskRow[] = found.slice(0, 20).map((t) => ({
      id: t.id,
      title: t.title,
      client: t.client?.name ?? "",
      service: t.service?.name ?? "",
      period: t.period,
      due_date: t.due_date,
      status: t.status,
      assignee: t.assignee?.name ?? null,
    }));

    const applied = describeFilters(effective);
    const answer = found.length
      ? `Found ${found.length} task${found.length === 1 ? "" : "s"} — ${applied.join(", ")}.` +
        (found.length > rows.length ? ` Showing the first ${rows.length}.` : "")
      : `Nothing matches ${applied.join(", ")} at the moment.`;

    return { tool: "search_tasks", answer, rows, applied, dropped, routedBy, degraded };
  }

  // ---- draft_reminder
  if (route.tool === "draft_reminder") {
    const name =
      vocabulary.clients.find((c) => message.toLowerCase().includes(c.toLowerCase())) ??
      route.client ??
      context.lastClient;
    if (!name) {
      return {
        tool: "draft_reminder",
        routedBy,
        answer: `Which client should I draft a reminder for? You have: ${vocabulary.clients.join(", ") || "no active clients"}.`,
      };
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase.from("clients").select("id").eq("name", name).maybeSingle();
    if (!data) return { tool: "draft_reminder", routedBy, answer: `I could not find a client called ${name}.` };

    const clientFacts = await collectClientFacts(data.id as string);
    if (!clientFacts) return { tool: "draft_reminder", routedBy, answer: `I could not read ${name}'s records.` };
    if (!clientFacts.owed.length && !clientFacts.blocked.length) {
      return {
        tool: "draft_reminder",
        client: name,
        routedBy,
        answer: `${name} owes nothing right now, so there is nothing to chase.`,
      };
    }

    const result = await askModel(
      [
        "Draft a polite reminder from the CA firm to this client, listing only what is outstanding.",
        "No deadlines that are not in the records, and no tax advice. The CA will send it themselves.",
        "Aim for about 120 words unless the instruction below asks for a different length or tone —",
        "if it does, follow the instruction.",
        "",
        `INSTRUCTION FROM THE CA: ${message}`,
        history.length ? `\nEARLIER IN THIS CONVERSATION\n${history.slice(-4).join("\n")}` : "",
        `\n${RECORDS_HEADER}\n${clientFacts.lines.join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    if (!result.ok) {
      return {
        tool: "draft_reminder",
        routedBy,
        degraded: result.detail,
        client: name,
        answer: `I cannot write the draft right now, but ${name} still owes:\n${clientFacts.lines.join("\n")}`,
      };
    }
    return { tool: "draft_reminder", answer: result.text, client: name, routedBy, degraded };
  }

  // ---- summarise and answer_from_records both read the same facts
  const facts = await collectFirmFacts();
  const instruction =
    route.tool === "summarise"
      ? SUMMARY_INSTRUCTION[route.summary_kind ?? "daily"]
      : "Answer the question using only the records below. If they do not contain the answer, say which record would be needed. " +
        "Do not answer tax, accounting or legal questions: say that is outside what this assistant does.";

  const prompt =
    route.tool === "summarise"
      ? [
          instruction,
          `The CA also said: ${message}. If that asks for a different length, tone or focus, follow it.`,
          history.length ? `\nEARLIER IN THIS CONVERSATION\n${history.slice(-4).join("\n")}` : "",
          `\n${RECORDS_HEADER}\n${facts.lines.join("\n")}`,
        ]
          .filter(Boolean)
          .join("\n")
      : [
          instruction,
          history.length ? `\nEARLIER IN THIS CONVERSATION\n${history.slice(-4).join("\n")}` : "",
          `\nQUESTION\n${message}`,
          `\n${RECORDS_HEADER}\n${facts.lines.join("\n")}`,
        ]
          .filter(Boolean)
          .join("\n");

  const result = await askModel(prompt);
  if (!result.ok) {
    return {
      tool: route.tool,
      routedBy,
      degraded: result.detail,
      answer:
        "The model is unavailable, so here are the records themselves, straight from the database:\n\n" +
        facts.lines.join("\n"),
    };
  }
  return { tool: route.tool, answer: result.text, routedBy, degraded };
}
