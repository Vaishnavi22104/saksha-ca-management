#!/usr/bin/env node
/**
 * Routing eval set.
 *
 *   npm run eval:ai
 *
 * Eighteen messages a real CA might type — including the misspelt ones —
 * each with the tool the assistant should pick. It runs them against the
 * model configured in .env.local and prints a pass rate.
 *
 * Why this exists: changing a prompt "slightly" is the easiest way to
 * break routing without noticing. Run this before and after any prompt
 * change, and before shipping to a firm. It is the difference between
 * "I think it still works" and "17/18, same as last week".
 *
 * NOTE: the routing prompt below mirrors routingPrompt() in
 * lib/ai-chat.ts. The tool list is read out of that file at runtime, so
 * a new or renamed tool cannot drift; the surrounding wording is a copy,
 * because a plain Node script cannot import the app's TypeScript. If you
 * materially change the wording there, copy it here too and re-run.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- config -----------------------------------------------------------
function loadEnv(file) {
  try {
    for (const line of readFileSync(join(root, file), "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const value = match[2].replace(/^["']|["']$/g, "");
      if (!(match[1] in process.env)) process.env[match[1]] = value;
    }
  } catch {
    // No .env.local is fine if the values are already exported.
  }
}
loadEnv(".env.local");

const PROVIDER = process.env.AI_PROVIDER === "openai" ? "openai" : "ollama";
const BASE_URL = process.env.AI_BASE_URL ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const MODEL = process.argv.includes("--fallback")
  ? process.env.AI_MODEL_FALLBACK || process.env.AI_MODEL
  : process.env.AI_MODEL ?? process.env.OLLAMA_MODEL ?? "llama3.2";
const API_KEY = process.env.AI_API_KEY ?? "";
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS ?? 700);
const THRESHOLD = Number(process.env.AI_EVAL_THRESHOLD ?? 0.85);

// --- tool list, read from the app so it cannot drift ------------------
function readTools() {
  const source = readFileSync(join(root, "lib", "ai-chat.ts"), "utf8");
  const block = /export const TOOLS = \{([\s\S]*?)\n\} as const;/.exec(source);
  if (!block) {
    console.error("Could not find TOOLS in lib/ai-chat.ts. Update scripts/eval-ai.mjs.");
    process.exit(2);
  }
  const tools = [...block[1].matchAll(/^\s{2}(\w+):\s*\n?\s*"([\s\S]*?)",\s*$/gm)].map((m) => [
    m[1],
    m[2].replace(/"\s*\+\s*\n\s*"/g, " "),
  ]);
  if (tools.length < 3) {
    console.error("Parsed fewer than three tools from lib/ai-chat.ts. Update scripts/eval-ai.mjs.");
    process.exit(2);
  }
  return tools;
}
const TOOLS = readTools();

// A small fixed vocabulary: the eval must not depend on whatever happens
// to be seeded in the database today.
const VOCAB = {
  services: ["GST Return", "Income Tax Return", "TDS Return", "Audit"],
  clients: ["ABC Traders", "Mehta Textiles", "Sunrise Foods"],
  staff: ["Rohit", "Anjali"],
};

function routingPrompt(message) {
  return [
    "Choose ONE tool for the user's message and reply with a single JSON object, nothing else.",
    "",
    "Tools:",
    ...TOOLS.map(([name, description]) => `  ${name}: ${description}`),
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
    `Valid services: ${VOCAB.services.join(" | ")}`,
    `Valid clients: ${VOCAB.clients.join(" | ")}`,
    `Valid staff: ${VOCAB.staff.join(" | ")}`,
    "Never invent a name that is not listed. Omit the key instead.",
    "Use search_tasks when the user wants a list of work; answer_from_records when they want an explanation.",
    "Use converse for hello, thanks, chit-chat, 'what can you do', or anything too vague to act on.",
    "The user types quickly and misspells words. Read past spelling mistakes and judge what they meant.",
    "",
    `MESSAGE: ${message}`,
  ].join("\n");
}

// --- the cases --------------------------------------------------------
// `accept` lists every tool that would be a reasonable answer. Where two
// tools are both defensible, both are allowed: an eval that fails on a
// judgement call teaches you nothing.
const CASES = [
  { message: "hi", accept: ["converse"] },
  { message: "helo ther", accept: ["converse"] },
  { message: "thanks!", accept: ["converse"] },
  { message: "what can u do", accept: ["converse"] },
  { message: "hmm", accept: ["converse"] },

  { message: "show me overdue gst work", accept: ["search_tasks"] },
  { message: "list tasks due in the next 7 days", accept: ["search_tasks"] },
  { message: "which tasks are unassigned", accept: ["search_tasks"] },
  { message: "shw me abc traders tasks", accept: ["search_tasks"] },
  { message: "anything waiting for the client", accept: ["search_tasks", "summarise"] },
  { message: "tds returns rohit is handling", accept: ["search_tasks"] },

  { message: "what should i look at first today", accept: ["summarise"] },
  { message: "give me a summary of the firm", accept: ["summarise"] },
  { message: "which documents am i still waiting for", accept: ["summarise", "search_tasks"] },
  { message: "how is work spread across the team", accept: ["summarise"] },

  { message: "draft a reminder for ABC Traders", accept: ["draft_reminder"] },
  { message: "chase mehta textiles for thier papers", accept: ["draft_reminder"] },

  { message: "why is sunrise foods audit taking so long", accept: ["answer_from_records"] },
  { message: "how many clients have overdue work", accept: ["answer_from_records", "search_tasks"] },
];

// --- one request ------------------------------------------------------
const SYSTEM =
  "You are the workflow assistant inside a chartered accountancy firm's practice management app. " +
  "Use ONLY the supplied records. Never invent clients, numbers, dates or documents.";

async function route(message) {
  const started = Date.now();
  const url =
    PROVIDER === "ollama"
      ? `${BASE_URL}/api/generate`
      : `${BASE_URL.replace(/\/$/, "")}/chat/completions`;
  const body =
    PROVIDER === "ollama"
      ? {
          model: MODEL,
          system: SYSTEM,
          prompt: routingPrompt(message),
          stream: false,
          format: "json",
          options: { temperature: 0, num_predict: MAX_TOKENS },
        }
      : {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: routingPrompt(message) },
          ],
        };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(PROVIDER === "openai" && API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    return { tool: null, ms: Date.now() - started, error: `HTTP ${response.status}` };
  }
  const data = await response.json();
  const text =
    PROVIDER === "ollama" ? String(data.response ?? "") : String(data.choices?.[0]?.message?.content ?? "");
  const match = /\{[\s\S]*\}/.exec(text);
  let tool = null;
  try {
    tool = match ? JSON.parse(match[0]).tool ?? null : null;
  } catch {
    tool = null;
  }
  return { tool, ms: Date.now() - started };
}

// --- run --------------------------------------------------------------
console.log(`Routing eval · provider ${PROVIDER} · model ${MODEL}\n`);

if (PROVIDER === "openai" && !API_KEY) {
  console.error("AI_API_KEY is not set in .env.local. Nothing to evaluate against.");
  process.exit(2);
}

let passed = 0;
const latencies = [];
const failures = [];

for (const testCase of CASES) {
  let result;
  try {
    result = await route(testCase.message);
  } catch (error) {
    result = { tool: null, ms: 0, error: error.message };
  }
  const ok = result.tool !== null && testCase.accept.includes(result.tool);
  if (ok) passed += 1;
  else failures.push({ ...testCase, got: result.tool ?? result.error ?? "no answer" });
  if (result.ms) latencies.push(result.ms);

  const mark = ok ? "PASS" : "FAIL";
  console.log(
    `${mark}  ${String(result.ms).padStart(5)}ms  ${testCase.message.padEnd(42)} ` +
      `→ ${result.tool ?? result.error ?? "-"}${ok ? "" : `   (expected ${testCase.accept.join(" or ")})`}`,
  );
}

const rate = passed / CASES.length;
const sorted = latencies.slice().sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
const slowest = sorted.length ? sorted[sorted.length - 1] : 0;

console.log(`\n${passed}/${CASES.length} correct (${Math.round(rate * 100)}%)`);
console.log(`Median ${median}ms · slowest ${slowest}ms · threshold ${Math.round(THRESHOLD * 100)}%`);

if (failures.length) {
  console.log("\nWorth a look:");
  for (const f of failures) console.log(`  "${f.message}" → ${f.got}, expected ${f.accept.join(" or ")}`);
}

if (rate < THRESHOLD) {
  console.log("\nBelow threshold. Check the routing prompt in lib/ai-chat.ts before shipping this change.");
  process.exit(1);
}
console.log("\nRouting is behaving.");
