// Research and coding suites: tool definitions, prompts, and per-task execution.

import { z } from "zod";
import type { LanguageModel } from "../../src/models/types.ts";
import { codingTasks, type CodingTask } from "../tasks/coding.ts";
import { corpus } from "../tasks/corpus.ts";
import { researchTasks, type ResearchTask } from "../tasks/research.ts";
import { runAgent, type AgentRun, type AgentTool, type CallRecord } from "./agent.ts";
import type { CodeRunner } from "./sandbox.ts";
import { scoreCoding, scoreResearch, type ResearchFinal, type Score } from "./scoring.ts";
import { CorpusIndex } from "./search.ts";

export type SuiteName = "research" | "coding";

export interface TaskOptions {
  constrained: boolean;
  signal?: AbortSignal;
  onCall?: (call: CallRecord, index: number) => void;
}

export interface TaskRun {
  suite: SuiteName;
  taskId: string;
  kind: string;
  score: Score;
  agent: AgentRun;
}

const index = new CorpusIndex(corpus);
const corpusIds = new Set(corpus.map((doc) => doc.id));
const MAX_DOC_CHARS = 2400;

export const RESEARCH_SYSTEM = `You are a research agent. Answer the user's question using only documents you find with the tools, not outside knowledge.
Search first, then read the documents you need. Some documents are outdated or corrected by later ones; prefer the most recent correction.
Finish with final_answer. Cite the IDs of the documents that support the answer. If the documents do not contain the answer, set "found" to false.`;

export const researchTools: AgentTool[] = [
  {
    name: "search",
    usage: `{"tool":"search","args":{"query":"..."}} searches the documents and returns IDs, titles and snippets.`,
    args: z.object({ query: z.string() }).strict(),
    execute: async ({ query }: { query: string }) => {
      const hits = index.search(query);
      if (!hits.length) return "No matching documents.";
      return hits.map((h) => `[${h.docId}] ${h.title}\n${h.snippet}`).join("\n\n");
    },
  },
  {
    name: "read",
    usage: `{"tool":"read","args":{"docId":"..."}} returns the full text of a document.`,
    args: z.object({ docId: z.string() }).strict(),
    execute: async ({ docId }: { docId: string }) => {
      const doc = index.get(docId);
      if (!doc) return `No document with ID "${docId}". Use an ID returned by search.`;
      return `[${doc.id}] ${doc.title}\n${doc.text.slice(0, MAX_DOC_CHARS)}`;
    },
  },
  {
    name: "final_answer",
    usage: `{"tool":"final_answer","args":{"found":true,"answer":"...","citations":["doc-id"]}} finishes the task.`,
    args: z.object({ found: z.boolean(), answer: z.string(), citations: z.array(z.string()) }).strict(),
  },
];

export async function runResearchTask(
  task: ResearchTask,
  model: LanguageModel,
  { constrained, signal, onCall }: TaskOptions,
): Promise<TaskRun> {
  const agent = await runAgent({
    model,
    system: RESEARCH_SYSTEM,
    task: task.question,
    tools: researchTools,
    finalTool: "final_answer",
    config: { constrained, maxCalls: 8, maxTokensPerCall: 256 },
    signal,
    onCall,
  });
  const score = scoreResearch(task, agent.final as ResearchFinal | undefined, corpusIds);
  return { suite: "research", taskId: task.id, kind: task.kind, score, agent };
}

/** Removes Markdown fences and module syntax the sandbox cannot evaluate. */
export function normalizeCode(code: string): string {
  return code
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/^\s*export\s+(default\s+)?/gm, "")
    .replace(/^\s*(import|module\.exports)\b.*$/gm, "");
}

function codingPrompt(task: CodingTask): string {
  const tests = task.visibleTests
    .map((t) => (t.throws ? `${t.expr} throws an error` : `${t.expr} returns ${JSON.stringify(t.expected)}`))
    .join("\n");
  const starter = task.starterCode ? `\n\nCurrent code:\n${task.starterCode}` : "";
  return `${task.prompt}${starter}\n\nVisible tests:\n${tests}\n\nThe code must define a function named ${task.entry}.`;
}

const CODING_SYSTEM = `You are a coding agent. Write plain JavaScript: no imports, no exports, no TypeScript, no console output.
Use run_tests to check your code against the visible tests, then submit it with final_answer. Hidden tests also check edge cases described in the task.`;

export async function runCodingTask(
  task: CodingTask,
  model: LanguageModel,
  runner: CodeRunner,
  { constrained, signal, onCall }: TaskOptions,
): Promise<TaskRun> {
  const tools: AgentTool[] = [
    {
      name: "run_tests",
      usage: `{"tool":"run_tests","args":{"code":"function ${task.entry}(...) {...}"}} runs the visible tests against the code.`,
      args: z.object({ code: z.string() }).strict(),
      execute: async ({ code }: { code: string }) => {
        const run = await runner.run(normalizeCode(code), task.visibleTests);
        if (run.error) return `Error: ${run.error}`;
        const lines = run.outcomes.map((o) => `${o.passed ? "PASS" : "FAIL"} ${o.expr}${o.detail ? `: ${o.detail}` : ""}`);
        const passed = run.outcomes.filter((o) => o.passed).length;
        lines.push(
          passed === run.outcomes.length
            ? `All ${passed} visible tests pass.`
            : `${passed} of ${run.outcomes.length} visible tests pass.`,
        );
        return lines.join("\n");
      },
    },
    {
      name: "final_answer",
      usage: `{"tool":"final_answer","args":{"code":"function ${task.entry}(...) {...}"}} submits the final code.`,
      args: z.object({ code: z.string() }).strict(),
    },
  ];
  const agent = await runAgent({
    model,
    system: CODING_SYSTEM,
    task: codingPrompt(task),
    tools,
    finalTool: "final_answer",
    config: { constrained, maxCalls: 6, maxTokensPerCall: 768 },
    signal,
    onCall,
  });
  const code = typeof agent.final?.code === "string" ? normalizeCode(agent.final.code) : undefined;
  const run = code === undefined ? undefined : await runner.run(code, [...task.visibleTests, ...task.hiddenTests]);
  return { suite: "coding", taskId: task.id, kind: task.kind, score: scoreCoding(task, run), agent };
}
