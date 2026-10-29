// Candidate prompts for the model's check of an answer (src/agent/review.ts), judged by asking the check
// again about recorded answers (eval/rereview.ts). A candidate that does better moves into review.ts;
// the others stay here, so their measurements can be repeated (eval/field/README.md).

import type { CheckedEvidence } from "../../src/agent/evidence.ts";
import { reviewMaterial, reviewPrompt, VERDICT_FORMAT } from "../../src/agent/review.ts";

type ReviewPrompt = (question: string, answer: string, evidence: CheckedEvidence[], titleFor: (docId: string) => string | undefined) => string;

/**
 * A more specific prompt (audit F2, priority 2), measured and not adopted: rather than ask whether the
 * passages state what the answer says, it names the points the broad question lets through (a value
 * from the wrong clause, a condition of the question the passage does not meet, half an answer, a claim
 * from memory) and asks for "yes" only when each one holds. On the 0.38.0 answers it changed one
 * verdict of 4B's 114, rejecting a right answer, and caught no wrong one more.
 */
export const itemizedReviewPrompt: ReviewPrompt = (question, answer, evidence, titleFor) =>
  [
    ...reviewMaterial(question, answer, evidence, titleFor),
    "Check the answer against the passages, point by point:",
    "- Values: every number, date, name and unit in the answer is in a passage, with the same value, and about the same thing the answer says it is about.",
    '- Conditions: when the question names a version, a year, a place, a person or a limit such as "since", "until", "before" or "after", the passage the answer relies on meets it.',
    "- Completeness: the answer gives everything the question asks for. A question in two parts needs both.",
    "- Nothing added: the answer claims nothing the passages do not state.",
    'Reply "yes" only if all four hold. Reply "partly" if any one of them fails. Reply "no" if the passages do not answer the question at all.',
    VERDICT_FORMAT,
  ].join("\n");

/** The prompts bench:rereview can ask with, by name: the app's own, and the candidates. */
export const REVIEW_PROMPTS: Record<string, ReviewPrompt> = { current: reviewPrompt, itemized: itemizedReviewPrompt };
