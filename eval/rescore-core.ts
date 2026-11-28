// The re-scoring of one recorded answer with the current quote check, sentence support and label rule,
// shared by bench:rescore and bench:baseline. See eval/rescore.ts for what it can and cannot re-check.

import { checkEvidence, answerStatus, type EvidenceItem } from "../src/agent/evidence.ts";
import { withoutPartLabels, type ResearchLibrary } from "../src/agent/research.ts";
import { reviewsShortAnswers, type ReviewVerdict } from "../src/agent/review.ts";
import { contradictedSupport, labelledQuotesFound, reviewAsked, sentenceSupport, wordChecksPass } from "../src/agent/support.ts";
import type { Report, TaskResult } from "./harness/benchmark.ts";
import { scoreResearch } from "./harness/scoring.ts";
import { loadFieldSuite } from "./harness/field.ts";
import { loadNodePdfLibrary } from "./harness/pdf-node.ts";
import { baseLibrary } from "./harness/suites.ts";
import { holdoutTasks } from "./field/holdout.ts";
import { multiHoldoutTasks, multiTasks } from "./field/multi.ts";
import { clinicalHoldoutTasks, clinicalTasks } from "./clinical/tasks.ts";
import { engineeringHoldoutTasks, engineeringTasks } from "./engineering/tasks.ts";
import { physicsHoldoutTasks, physicsTasks } from "./physics/tasks.ts";
import { mathHoldoutTasks, mathTasks } from "./math/tasks.ts";
import { chemHoldoutTasks, chemTasks } from "./chem/tasks.ts";
import { socsciHoldoutTasks, socsciTasks } from "./socsci/tasks.ts";
import { materialsHoldoutTasks, materialsTasks } from "./materials/tasks.ts";
import { csHoldoutTasks, csTasks } from "./cs/tasks.ts";
import { labHoldoutTasks, labTasks } from "./lab/tasks.ts";
import { officeHoldoutTasks, officeTasks } from "./field/office.ts";
import { pdfTasks } from "./tasks/pdf.ts";
import { researchTasks, type ResearchTask } from "./tasks/research.ts";
import { unanswerableTasks } from "./tasks/unanswerable.ts";

export type RescoreSuites = Record<string, { library: ResearchLibrary; tasks: ResearchTask[] }>;

/** Every suite a recorded report can hold, with its library, as the harness builds them. */
export async function loadRescoreSuites(): Promise<RescoreSuites> {
  const field = await loadFieldSuite();
  const pdfLibrary = await loadNodePdfLibrary();
  return {
  research: { library: baseLibrary, tasks: researchTasks },
  unanswerable: { library: baseLibrary, tasks: unanswerableTasks },
  pdf: { library: pdfLibrary, tasks: pdfTasks },
  field: { library: field.library, tasks: field.tasks },
  holdout: { library: field.library, tasks: holdoutTasks },
  multi: { library: field.library, tasks: multiTasks },
  multiholdout: { library: field.library, tasks: multiHoldoutTasks },
    office: { library: field.officeLibrary, tasks: officeTasks },
    officeholdout: { library: field.officeLibrary, tasks: officeHoldoutTasks },
    clinical: { library: field.clinicalLibrary, tasks: clinicalTasks },
    clinicalholdout: { library: field.clinicalLibrary, tasks: clinicalHoldoutTasks },
    engineering: { library: field.engineeringLibrary, tasks: engineeringTasks },
    engineeringholdout: { library: field.engineeringLibrary, tasks: engineeringHoldoutTasks },
    physics: { library: field.physicsLibrary, tasks: physicsTasks },
    physicsholdout: { library: field.physicsLibrary, tasks: physicsHoldoutTasks },
    math: { library: field.mathLibrary, tasks: mathTasks },
    mathholdout: { library: field.mathLibrary, tasks: mathHoldoutTasks },
    chem: { library: field.chemLibrary, tasks: chemTasks },
    chemholdout: { library: field.chemLibrary, tasks: chemHoldoutTasks },
    socsci: { library: field.socsciLibrary, tasks: socsciTasks },
    socsciholdout: { library: field.socsciLibrary, tasks: socsciHoldoutTasks },
    materials: { library: field.materialsLibrary, tasks: materialsTasks },
    materialsholdout: { library: field.materialsLibrary, tasks: materialsHoldoutTasks },
    cs: { library: field.csLibrary, tasks: csTasks },
    csholdout: { library: field.csLibrary, tasks: csHoldoutTasks },
    lab: { library: field.labLibrary, tasks: labTasks },
    labholdout: { library: field.labLibrary, tasks: labHoldoutTasks },
};
}

export interface Rescored {
  /** Whether the answer passes its task, scored again (it needs a verified quote). */
  passed: boolean;
  /** Whether it is labelled Quotes found ("Backed by quotes") under the current rules. */
  labelled: boolean;
  support: ReturnType<typeof contradictedSupport>;
  /** The answer's status now: "verified" when every quote is still in its source. */
  status: ReturnType<typeof answerStatus>;
}

/**
 * One recorded answer re-scored; "cut" when its final answer was recorded only in part, and undefined
 * when it has none, or its suite or task is no longer in the harness.
 */
export function rescoreResult(report: Report, result: TaskResult, suites: RescoreSuites): Rescored | "cut" | undefined {
  const suite = suites[result.suite];
  const task = suite?.tasks.find((t) => t.id === result.taskId);
  if (!suite || !task || !result.final) return undefined;
  let final: { found: boolean; answer: string; evidence: EvidenceItem[] };
  try {
    final = JSON.parse(result.final);
  } catch {
    return "cut"; // cut at FINAL_CHARS characters (600 before harness 0.47.0)
  }
  const { library } = suite;
  const answer = withoutPartLabels(final.answer);
  const evidence = checkEvidence(final.evidence, (id) => library.textFor(id), (id) => library.pageStartsFor(id));
  const status = answerStatus(final.found, evidence);
  // The documents the recorded run read or cited, as the app gathers them (research.ts), so the
  // contradiction check of 0.75.0 sees what the model saw.
  const readIds = [
    ...new Set(
      [...(result.actions ?? []).flatMap((a: string) => [...a.matchAll(/"docId":"([^"]+)"/g)].map((m) => m[1]!)), ...final.evidence.map((e) => e.docId)].map((id) =>
        id.replace(/#\d+$/, ""),
      ),
    ),
  ];
  const readDocuments = readIds.flatMap((docId) => {
    const text = library.textFor(docId);
    return text ? [{ docId, text }] : [];
  });
  const support = contradictedSupport(
    sentenceSupport(answer, evidence, (id) => library.documentFor(id)?.title, task.question),
    readDocuments,
    evidence.filter((e) => e.verified),
    (id) => library.documentFor(id)?.title,
    task.question,
  );
  // The recorded review counts only where the app would still ask for it (research.ts): an answer the
  // word checks no longer pass, and too short for the models whose short answers are reviewed, is not
  // reviewed, so its recorded "yes" does not label it. The cross-check and completeness check follow it.
  const asked =
    wordChecksPass(status, evidence, support) || (reviewsShortAnswers(report.environment.modelId) && reviewAsked(status, evidence, support));
  const review = asked ? (result.support?.review as ReviewVerdict | undefined) : undefined;
  const crossCheck = result.support?.crossCheck;
  const completeness = result.support?.completeness;
  const labelled = labelledQuotesFound(
    status,
    evidence,
    review ? { ...support, review, ...(crossCheck ? { crossCheck } : {}), ...(completeness ? { completeness } : {}) } : support,
  );
  const passed = scoreResearch(task, { status, final: { ...final, answer }, evidence, citations: {}, sourceErrors: [], agent: undefined! }, library).passed;
  return { passed, labelled, support, status };
}
