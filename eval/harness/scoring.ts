import type { CodingTask } from "../tasks/coding.ts";
import type { ResearchTask } from "../tasks/research.ts";
import type { ResearchLibrary, ResearchResult } from "../../src/agent/research.ts";
import type { TestRun } from "./sandbox.ts";

export interface Score {
  passed: boolean;
  /** Named checks, so reports show why a task failed. */
  checks: Record<string, boolean>;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

/**
 * A research task passes when the agent finishes, reports `found` correctly,
 * and cites only real documents. Answerable tasks also need every required fact
 * in the answer, every required source cited, and at least one quote that is
 * really in a cited document (the evidence check).
 */
export function scoreResearch(task: ResearchTask, result: ResearchResult, library: ResearchLibrary): Score {
  const final = result.final;
  if (!final) return { passed: false, checks: { finished: false } };
  const answer = normalize(final.answer);
  const cited = new Set(final.evidence.map((e) => library.documentFor(e.docId)?.id ?? e.docId));
  const checks: Record<string, boolean> = {
    finished: true,
    found: final.found === task.answerable,
    // Citing a document that does not exist is a fabricated source.
    citationsExist: final.evidence.every((e) => library.documentFor(e.docId) !== undefined),
  };
  if (task.answerable) {
    checks.facts = task.facts.every((group) => group.some((option) => answer.includes(normalize(option))));
    checks.citations = task.citations.every((group) => group.some((id) => cited.has(id)));
    checks.evidence = result.status === "verified";
  }
  return { passed: Object.values(checks).every(Boolean), checks };
}

export function scoreCoding(_task: CodingTask, run: TestRun | undefined): Score {
  if (!run) return { passed: false, checks: { finished: false } };
  const passed = !run.error && run.outcomes.length > 0 && run.outcomes.every((o) => o.passed);
  return { passed, checks: { finished: true, testsPass: passed } };
}
