import type { CodingTask } from "../tasks/coding.ts";
import type { ResearchTask } from "../tasks/research.ts";
import type { ResearchFinal } from "../../src/tools/research.ts";
import type { TestRun } from "./sandbox.ts";

export interface Score {
  passed: boolean;
  /** Named checks, so reports show why a task failed. */
  checks: Record<string, boolean>;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

export function scoreResearch(task: ResearchTask, final: ResearchFinal | undefined, corpusIds: Set<string>): Score {
  if (!final) return { passed: false, checks: { finished: false } };
  const answer = normalize(final.answer);
  const cited = new Set(final.citations);
  const checks: Record<string, boolean> = {
    finished: true,
    found: final.found === task.answerable,
    // Citing a document that does not exist is a fabricated source.
    citationsExist: final.citations.every((id) => corpusIds.has(id)),
  };
  if (task.answerable) {
    checks.facts = task.facts.every((group) => group.some((option) => answer.includes(normalize(option))));
    checks.citations = task.citations.every((group) => group.some((id) => cited.has(id)));
  }
  return { passed: Object.values(checks).every(Boolean), checks };
}

export function scoreCoding(_task: CodingTask, run: TestRun | undefined): Score {
  if (!run) return { passed: false, checks: { finished: false } };
  const passed = !run.error && run.outcomes.length > 0 && run.outcomes.every((o) => o.passed);
  return { passed, checks: { finished: true, testsPass: passed } };
}
