// The Past answers page (AnswersScreen.tsx): finding a saved answer by its words or its label, and the
// few recent ones the research screen keeps. Past answers used to be listed in full on the research
// screen, which grew with every answer and pushed the question box out of view.

import { listLabel, type SavedAnswer } from "./answers.ts";

/** How many recent answers the research screen lists; the rest are on the answers page. */
export const RECENT_COUNT = 3;

export type AnswerFilter = "all" | "found" | "check" | "danger" | "none" | "reports";

/** The label filter's choices, as the answers page shows them. */
export const ANSWER_FILTERS: Array<[AnswerFilter, string]> = [
  ["all", "All answers"],
  ["found", "✓ Quotes found"],
  ["check", "⚠ To check"],
  ["danger", "✗ Quotes missing or not found"],
  ["none", "No answer"],
  ["reports", "Reports"],
];

/** Lower case, without accents, so "energie" finds "Énergie". */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Everything a search looks in: the question, the answer, and a report's request and sections. */
function searchText(answer: SavedAnswer): string {
  const report = answer.report;
  const parts = [answer.question, answer.answer ?? "", answer.noAnswer ?? ""];
  if (report) parts.push(report.request, ...report.plan, ...report.sections.map((s) => s.answer ?? ""));
  return fold(parts.join("\n"));
}

/** The answers that match every word of `query` and the label filter, newest first. */
export function filterAnswers(answers: SavedAnswer[], query: string, filter: AnswerFilter): SavedAnswer[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return [...answers].reverse().filter((answer) => {
    if (filter === "reports" && !answer.report) return false;
    if (filter !== "all" && filter !== "reports" && listLabel(answer).severity !== filter) return false;
    if (!words.length) return true;
    const text = searchText(answer);
    return words.every((word) => text.includes(word));
  });
}

/** The research screen's recent answers, newest first, without the one shown above them. */
export function recentAnswers(answers: SavedAnswer[], shownId?: string): SavedAnswer[] {
  return answers.filter((a) => a.id !== shownId).slice(-RECENT_COUNT).reverse();
}

/** "42 answers", or "5 of 42 answers" when a search or filter leaves some out. */
export function describeCount(shown: number, total: number): string {
  const noun = total === 1 ? "answer" : "answers";
  return shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`;
}
