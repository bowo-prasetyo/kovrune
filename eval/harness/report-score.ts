// Scoring a written report against the sections its request should cover (eval/field/reports.ts,
// docs/report-mode.md slice 4). A plan question is matched to the expected section whose keywords
// it contains most; a section is right when its answer gives that section's facts, as a field task's
// answer must. Sections that match no expected section are counted, not scored: they may be right
// answers to questions the suite did not foresee.

import type { ExpectedSection, ReportTask } from "../field/reports.ts";

const lower = (text: string) => text.toLowerCase().replace(/\s+/g, " ");

/** The index of the expected section a plan question asks about, or undefined when it shares no keyword with any. */
export function matchSection(question: string, sections: ExpectedSection[]): number | undefined {
  const text = lower(question);
  let best: number | undefined;
  let bestHits = 0;
  sections.forEach((section, i) => {
    const hits = section.keywords.filter((k) => text.includes(lower(k))).length;
    if (hits > bestHits) [best, bestHits] = [i, hits];
  });
  return best;
}

/** Whether an answer gives every fact group of a section, as scoreResearch checks facts. */
export function givesFacts(answer: string, section: ExpectedSection): boolean {
  const text = lower(answer);
  return section.facts.every((group) => group.some((option) => text.includes(lower(option))));
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
