// Research and coding suites: tool definitions, prompts, and per-task execution.

import { z } from "zod";
import type { LanguageModel } from "../../src/models/types.ts";
import { type CodingTask } from "../tasks/coding.ts";
import { corpus } from "../tasks/corpus.ts";
import { type ResearchTask } from "../tasks/research.ts";
import { runAgent, type AgentRun, type AgentTool, type CallRecord } from "../../src/agent/agent.ts";
import { ResearchLibrary, runResearch, type ResearchResult } from "../../src/agent/research.ts";
import type { CodeRunner } from "./sandbox.ts";
import { scoreCoding, scoreResearch, type Score } from "./scoring.ts";

/**
 * research: the 22 M0 research tasks; unanswerable: 8 more questions the corpus
 * cannot answer; pdf: 4 tasks over PDF documents; coding: 12 coding tasks;
 * field: questions over real documents (eval/field/), run only when asked for; holdout: more
 * questions over the same documents that changes are not tuned on (eval/field/holdout.ts);
 * multi and multiholdout: questions over the same documents that need more than one passage,
 * the second read only as totals (eval/field/multi.ts).
 */
export type SuiteName = "research" | "unanswerable" | "pdf" | "coding" | "field" | "holdout" | "multi" | "multiholdout";

/** The suites over the field documents, which need them loaded (loadFieldSuite). */
export const FIELD_SUITES: SuiteName[] = ["field", "holdout", "multi", "multiholdout"];

/** The evaluation set the gate needs. The field suite is reported separately, so M0 comparisons stay valid. */
export const ALL_SUITES: SuiteName[] = ["research", "unanswerable", "pdf", "coding"];

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
  /** Research tasks: the answer's status and evidence, for reports. */
  research?: ResearchResult;
}

/** The base corpus as a research library; the pdf suite adds the PDF documents. */
export const baseLibrary = new ResearchLibrary(corpus);

export async function runResearchTask(
  task: ResearchTask,
  suite: Exclude<SuiteName, "coding">,
  library: ResearchLibrary,
  model: LanguageModel,
  { constrained, signal, onCall }: TaskOptions,
): Promise<TaskRun> {
  const research = await runResearch({ question: task.question, library, model, constrained, signal, onCall });
  const score = scoreResearch(task, research, library);
  return { suite, taskId: task.id, kind: task.kind, score, agent: research.agent, research };
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
