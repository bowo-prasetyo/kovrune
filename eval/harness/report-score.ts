// Scoring a written report against the sections its request should cover (eval/field/reports.ts,
// docs/report-mode.md slice 4). A plan question is matched to the expected section whose keywords
// it contains most; a section is right when its answer gives that section's facts, as a field task's
// answer must. Sections that match no expected section are counted, not scored: they may be right
// answers to questions the suite did not foresee.

import type { ExpectedSection, ReportTask } from "../field/reports.ts";
import { containsKeyword, containsPhrase } from "./matching.ts";

/** The index of the expected section a plan question asks about, or undefined when it shares no keyword with any. */
export function matchSection(question: string, sections: ExpectedSection[]): number | undefined {
  let best: number | undefined;
  let bestHits = 0;
  sections.forEach((section, i) => {
    const hits = section.keywords.filter((k) => containsKeyword(question, k)).length;
    if (hits > bestHits) [best, bestHits] = [i, hits];
  });
  return best;
}

/** Whether an answer gives every fact group of a section, as scoreResearch checks facts. */
export function givesFacts(answer: string, section: ExpectedSection): boolean {
  return section.facts.every((group) => group.some((option) => containsPhrase(answer, option)));
}

/** A question that joins two things with "and" or "as well as": the kind the multi-passage suites showed is harder. */
export function joinsTwoThings(question: string): boolean {
  return /\b(and|as well as)\b/i.test(question);
}

export interface WrittenSection {
  question: string;
  /** The final answer, or empty when the section ended without one. */
  answer: string;
  quotesFound: boolean;
  status: string;
  calls: number;
  ms: number;
}

export interface ReportScore {
  planned: number;
  fallback: boolean;
  joined: number;
  /** Expected sections some plan question asks about. */
  planCovered: number;
  /** Expected sections whose facts some written section's answer gives. */
  covered: number;
  expected: number;
  /** Written sections matched to an expected section, those that give its facts, and those labelled Quotes found without them. */
  matched: number;
  right: number;
  labelledWrong: number;
  labelled: number;
  /** Written sections that match no expected section, and how many of them are labelled Quotes found. */
  unmatched: number;
  unmatchedLabelled: number;
  calls: number;
  ms: number;
}

export function scoreReport(task: ReportTask, plan: { sections: string[]; fallback?: boolean }, written: WrittenSection[]): ReportScore {
  const matches = written.map((s) => matchSection(s.question, task.sections));
  const planMatches = new Set(plan.sections.map((q) => matchSection(q, task.sections)).filter((i) => i !== undefined));
  const right = written.map((s, i) => matches[i] !== undefined && givesFacts(s.answer, task.sections[matches[i]!]!));
  return {
    planned: plan.sections.length,
    fallback: plan.fallback === true,
    joined: plan.sections.filter(joinsTwoThings).length,
    planCovered: planMatches.size,
    covered: task.sections.filter((section) => written.some((s) => givesFacts(s.answer, section))).length,
    expected: task.sections.length,
    matched: matches.filter((m) => m !== undefined).length,
    right: right.filter(Boolean).length,
    labelledWrong: written.filter((s, i) => matches[i] !== undefined && s.quotesFound && !right[i]).length,
    labelled: written.filter((s, i) => matches[i] !== undefined && s.quotesFound).length,
    unmatched: matches.filter((m) => m === undefined).length,
    unmatchedLabelled: written.filter((s, i) => matches[i] === undefined && s.quotesFound).length,
    calls: written.reduce((n, s) => n + s.calls, 0),
    ms: written.reduce((n, s) => n + s.ms, 0),
  };
}

/** Scores summed over reports. */
export function sumScores(scores: ReportScore[]): Omit<ReportScore, "fallback"> & { reports: number; fallbacks: number } {
  const sum = (key: keyof Omit<ReportScore, "fallback">) => scores.reduce((n, s) => n + (s[key] as number), 0);
  return {
    reports: scores.length,
    fallbacks: scores.filter((s) => s.fallback).length,
    planned: sum("planned"),
    joined: sum("joined"),
    planCovered: sum("planCovered"),
    covered: sum("covered"),
    expected: sum("expected"),
    matched: sum("matched"),
    right: sum("right"),
    labelledWrong: sum("labelledWrong"),
    labelled: sum("labelled"),
    unmatched: sum("unmatched"),
    unmatchedLabelled: sum("unmatchedLabelled"),
    calls: sum("calls"),
    ms: sum("ms"),
  };
}

/**
 * Whether the plan screen's source check (src/agent/report.ts assessPlanCoverage) predicts how a section
 * turns out (harness 0.110.0). The hint is worth showing only if it tells sections that will fail from
 * sections that will not; that it is visible says nothing. For each written section matched to an
 * expected section, the hint is put in one of three classes, and the section's result is counted in it:
 * - `empty`: no passage surfaced (the hint tells the reader to rephrase or drop the section);
 * - `expected`: a passage surfaced in a document the expected section's facts are in;
 * - `elsewhere`: passages surfaced, but none in such a document.
 * Unmatched sections cannot be scored, so they are counted apart.
 */
export interface CoverageClass {
  sections: number;
  right: number;
  /** Labelled Quotes found without the section's facts. */
  labelledWrong: number;
}

export interface CoveragePrediction {
  empty: CoverageClass;
  expected: CoverageClass;
  elsewhere: CoverageClass;
  unmatched: number;
}

export interface SectionHint {
  question: string;
  matches: Array<{ docId?: string }>;
}

const emptyClass = (): CoverageClass => ({ sections: 0, right: 0, labelledWrong: 0 });

export function emptyPrediction(): CoveragePrediction {
  return { empty: emptyClass(), expected: emptyClass(), elsewhere: emptyClass(), unmatched: 0 };
}

/** Adds one report's sections to `into`, by the hint each section's question was given. */
export function predictFromCoverage(task: ReportTask, hints: SectionHint[], written: WrittenSection[], into = emptyPrediction()): CoveragePrediction {
  for (const section of written) {
    const i = matchSection(section.question, task.sections);
    if (i === undefined) {
      into.unmatched++;
      continue;
    }
    const expected = task.sections[i]!;
    const hint = hints.find((h) => h.question === section.question);
    const cited = new Set(expected.citations.flat());
    const kind = !hint || !hint.matches.length ? "empty" : hint.matches.some((m) => m.docId && cited.has(m.docId)) ? "expected" : "elsewhere";
    const right = givesFacts(section.answer, expected);
    into[kind].sections++;
    if (right) into[kind].right++;
    if (section.quotesFound && !right) into[kind].labelledWrong++;
  }
  return into;
}

/** One line per class, for the report suite's summary: how many sections, and how many of them right. */
export function describePrediction(p: CoveragePrediction): string {
  const line = (name: string, c: CoverageClass) =>
    `${name}: ${c.sections} ${c.sections === 1 ? "section" : "sections"}, ${c.right} right${c.sections ? ` (${Math.round((100 * c.right) / c.sections)}%)` : ""}, ${c.labelledWrong} labelled Quotes found and wrong`;
  return [
    line("no passage surfaced", p.empty),
    line("a passage in the expected document", p.expected),
    line("passages only in other documents", p.elsewhere),
    `unmatched, not scored: ${p.unmatched}`,
  ].join("\n");
}
