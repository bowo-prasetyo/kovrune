// The recorded answers a report's checks can be asked about again (eval/rereview.ts, eval/crosscheck.ts):
// each final answer, checked and labelled again with the current code, as bench:rescore does.

import { answerStatus, checkEvidence, type CheckedEvidence, type EvidenceItem } from "../../src/agent/evidence.ts";
import { withoutPartLabels, type ResearchLibrary } from "../../src/agent/research.ts";
import { reviewsShortAnswers, type ReviewVerdict } from "../../src/agent/review.ts";
import { reviewAsked, sentenceSupport, wordChecksPass } from "../../src/agent/support.ts";
import type { Report } from "./benchmark.ts";
import { loadFieldSuite } from "./field.ts";
import { loadNodePdfLibrary } from "./pdf-node.ts";
import { baseLibrary } from "./suites.ts";
import { holdoutTasks } from "../field/holdout.ts";
import { pdfTasks } from "../tasks/pdf.ts";
import { researchTasks, type ResearchTask } from "../tasks/research.ts";
import { unanswerableTasks } from "../tasks/unanswerable.ts";

/** Each suite's library and tasks, as the benchmark runs them. */
export async function loadSuites(): Promise<Record<string, { library: ResearchLibrary; tasks: ResearchTask[] }>> {
  const field = await loadFieldSuite();
  return {
    research: { library: baseLibrary, tasks: researchTasks },
    unanswerable: { library: baseLibrary, tasks: unanswerableTasks },
    pdf: { library: await loadNodePdfLibrary(), tasks: pdfTasks },
    field: { library: field.library, tasks: field.tasks },
    holdout: { library: field.library, tasks: holdoutTasks },
  };
}

export interface RecordedAnswer {
  suite: string;
  taskId: string;
  question: string;
  answer: string;
  evidence: CheckedEvidence[];
  titleFor: (docId: string) => string | undefined;
  /** Whether the task passed in the report. */
  right: boolean;
  /** No sentence long enough for the word checks: a short answer. */
  short: boolean;
  /** The review's verdict in the report, when it was asked. */
  recorded?: ReviewVerdict;
}

/**
 * The answers of a report the app asks its check about: every quote found, and the word checks passing,
 * or, for models whose check is asked about short answers (review.ts reviewsShortAnswers) or with
 * `short`, an answer too short for them. Answers cut off in the report (it keeps 600 characters of each
 * final answer) are left out and counted.
 */
export function checkedAnswers(
  report: Report,
  suites: Awaited<ReturnType<typeof loadSuites>>,
  options: { short?: boolean } = {},
): { answers: RecordedAnswer[]; cutOff: number } {
  const asksShort = options.short || reviewsShortAnswers(report.environment.modelId);
  const answers: RecordedAnswer[] = [];
  let cutOff = 0;
  for (const result of report.results) {
    const suite = suites[result.suite];
    const task = suite?.tasks.find((t) => t.id === result.taskId);
    if (!suite || !task || !result.final) continue;
    let final: { found: boolean; answer: string; evidence: EvidenceItem[] };
    try {
      final = JSON.parse(result.final);
    } catch {
      cutOff++;
      continue;
    }
    const { library } = suite;
    const titleFor = (id: string) => library.documentFor(id)?.title;
    const answer = withoutPartLabels(final.answer);
    const evidence = checkEvidence(final.evidence, (id) => library.textFor(id), (id) => library.pageStartsFor(id));
    const status = answerStatus(final.found, evidence);
    const support = sentenceSupport(answer, evidence, titleFor, task.question);
    if (!(wordChecksPass(status, evidence, support) || (asksShort && reviewAsked(status, evidence, support)))) continue;
    const recorded = result.support?.review as ReviewVerdict | undefined;
    answers.push({
      suite: result.suite,
      taskId: result.taskId,
      question: task.question,
      answer,
      evidence,
      titleFor,
      right: result.passed,
      short: support.judged === 0,
      ...(recorded ? { recorded } : {}),
    });
  }
  return { answers, cutOff };
}
