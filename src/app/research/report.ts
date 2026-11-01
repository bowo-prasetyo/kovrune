// Report mode in the app (docs/report-mode.md): editing the plan, its time estimate, and noticing a
// question that asks for a report (slice 1); how a report is saved and summed up (slice 2). Its export
// is in answers.ts (slice 3).

import { MAX_SECTIONS, MIN_SECTIONS, type ReportPlan } from "../../agent/report.ts";
import type { SavedAnswer, SavedReport } from "./answers.ts";

/** Above this many minutes, a report asks for confirmation before it starts (decision R5). */
export const CONFIRM_REPORT_MINUTES = 30;

/**
 * The longest a report may take: each section is a question, so the model test's longest question
 * time, once per section. Undefined when the model has not been tested.
 */
export function reportMinutes(sections: number, maxTaskMinutes?: number): number | undefined {
  return maxTaskMinutes === undefined ? undefined : sections * maxTaskMinutes;
}

/** The documents a plan was made from, as the plan screen names them: "Guide.md", "A.txt and B.pdf", "A.txt, B.pdf and 2 more". */
export function describeConsulted(titles: string[]): string {
  const quoted = titles.map((t) => `“${t}”`);
  if (quoted.length <= 2) return quoted.join(" and ");
  if (quoted.length === 3) return `${quoted[0]}, ${quoted[1]} and ${quoted[2]}`;
  return `${quoted[0]}, ${quoted[1]} and ${quoted.length - 2} more`;
}

/** "5 sections, up to 35 min", and whether to ask for confirmation first. */
export function describeEstimate(sections: number, maxTaskMinutes?: number): { text: string; confirm: boolean } {
  const count = `${sections} ${sections === 1 ? "section" : "sections"}`;
  const minutes = reportMinutes(sections, maxTaskMinutes);
  if (minutes === undefined) return { text: `${count}; test the model to see how long they can take`, confirm: false };
  const longest = minutes < 1 ? "under a minute" : minutes < 90 ? `up to ${Math.round(minutes)} min` : `up to ${Math.round(minutes / 6) / 10} hours`;
  return { text: `${count}, ${longest}`, confirm: minutes > CONFIRM_REPORT_MINUTES };
}

/**
 * Whether a question asks for a report rather than an answer: "report", "essay" or "overview", or a
 * length in words. Only suggests the report option; it never switches by itself (decision R2).
 */
export function looksLikeReport(question: string): boolean {
  return /\b(report|essay|overview|write-?up)\b|\b\d{3,}\s+words\b/i.test(question);
}

/** Plan edits, each giving a new plan: the questions stay within MIN_SECTIONS and MAX_SECTIONS. */
export const planEdits = {
  setTitle: (plan: ReportPlan, title: string): ReportPlan => ({ ...plan, title }),
  setQuestion: (plan: ReportPlan, index: number, question: string): ReportPlan => ({
    ...plan,
    sections: plan.sections.map((q, i) => (i === index ? question : q)),
  }),
  add: (plan: ReportPlan): ReportPlan => (plan.sections.length >= MAX_SECTIONS ? plan : { ...plan, sections: [...plan.sections, ""] }),
  remove: (plan: ReportPlan, index: number): ReportPlan =>
    plan.sections.length <= 1 ? plan : { ...plan, sections: plan.sections.filter((_, i) => i !== index) },
  move: (plan: ReportPlan, index: number, by: -1 | 1): ReportPlan => {
    const to = index + by;
    if (to < 0 || to >= plan.sections.length) return plan;
    const sections = [...plan.sections];
    [sections[index], sections[to]] = [sections[to]!, sections[index]!];
    return { ...plan, sections };
  },
};

/** Whether a plan can be researched: a title, and between MIN_SECTIONS and MAX_SECTIONS questions, none empty. A fallback plan of one section can be too. */
export function planReady(plan: ReportPlan): boolean {
  const questions = plan.sections.map((q) => q.trim());
  const count = questions.length >= MIN_SECTIONS || (plan.fallback === true && questions.length === 1);
  return plan.title.trim() !== "" && count && questions.length <= MAX_SECTIONS && questions.every(Boolean);
}

/**
 * A report's status, as one answer's: verified when every section that has an answer is backed by a
 * found quote; no-answer when no section has an answer; otherwise unverified. The view shows the
 * sections' own labels; this only keeps a report a valid saved answer.
 */
export function reportStatus(sections: SavedAnswer[]): SavedAnswer["status"] {
  const answered = sections.filter((s) => s.status !== "no-answer" && s.status !== "not-found");
  if (!answered.length) return sections.some((s) => s.status === "not-found") ? "not-found" : "no-answer";
  return answered.every((s) => s.status === "verified") ? "verified" : "unverified";
}

/** A report as a saved answer: its title, the sections written so far, and their status. */
export function toSavedReport(options: {
  id: string;
  askedAt: string;
  model: string;
  plan: ReportPlan;
  request: string;
  sections: SavedAnswer[];
  unfinished?: boolean;
  stopped?: boolean;
}): SavedAnswer {
  const { sections } = options;
  return {
    id: options.id,
    question: options.plan.title,
    askedAt: options.askedAt,
    model: options.model,
    status: reportStatus(sections),
    evidence: [],
    citations: {},
    titles: {},
    sourceErrors: [],
    steps: [],
    report: {
      title: options.plan.title,
      request: options.request,
      plan: [...options.plan.sections],
      sections,
      ...(options.unfinished ? { unfinished: true } : {}),
      ...(options.stopped ? { stopped: true } : {}),
    },
  };
}

/**
 * The line above a report: how many sections each label went to, the label the reader trusts most
 * first, e.g. "4 of 5 sections: Quotes found. 1: Quotes found, answer not confirmed."
 */
export function describeReportLabels(report: SavedReport, label: (section: SavedAnswer) => string): string {
  const counts = new Map<string, number>();
  for (const section of report.sections) {
    const kind = labelKind(label(section));
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const total = report.plan.length;
  const order = [...counts.entries()].sort((a, b) => Number(b[0] === "Quotes found") - Number(a[0] === "Quotes found") || b[1] - a[1]);
  const parts = order.map(([name, n], i) => (i === 0 ? `${n} of ${total} ${total === 1 ? "section" : "sections"}: ${name}.` : `${n}: ${name}.`));
  const missing = total - report.sections.length;
  if (missing > 0) {
    const why = report.stopped ? "stopped before they were written" : report.unfinished ? "not written: the page was closed or reloaded" : "not written";
    parts.push(`${missing} ${why}.`);
  }
  return parts.join(" ") || `0 of ${total} sections written.`;
}

/**
 * A label without its counts, so sections with the same kind of label are counted together:
 * "2 of 13 sentences backed by a quote" is "Some sentences not backed by a quote", and
 * "Some quotes not found (2 of 3 found)" is "Some quotes not found".
 */
export function labelKind(label: string): string {
  if (/^\d+ of \d+ sentences? backed by a quote$/.test(label)) return "Some sentences not backed by a quote";
  return label.replace(/ \(\d+ of \d+ found\)$/, "");
}

/** Puts a record in the list, replacing the one with its ID: a report is saved again after each section. */
export function upsert<T extends { id: string }>(records: T[], record: T): T[] {
  return records.some((r) => r.id === record.id) ? records.map((r) => (r.id === record.id ? record : r)) : [...records, record];
}
