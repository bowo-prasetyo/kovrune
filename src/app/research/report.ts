// The report plan screen (docs/report-mode.md, slice 1): editing the plan, its time estimate, and
// noticing a question that asks for a report. Researching the sections arrives in slice 2; until then
// the option is shown only with ?report in the address, for review on the preview.

import { MAX_SECTIONS, MIN_SECTIONS, type ReportPlan } from "../../agent/report.ts";

/** Whether the report option is shown: only with ?report in the address until its sections can run. */
export function reportModeEnabled(search: string = globalThis.location?.search ?? ""): boolean {
  try {
    return new URLSearchParams(search).has("report");
  } catch {
    return false;
  }
}

/** Above this many minutes, a report asks for confirmation before it starts (decision R5). */
export const CONFIRM_REPORT_MINUTES = 30;

/**
 * The longest a report may take: each section is a question, so the model test's longest question
 * time, once per section. Undefined when the model has not been tested.
 */
export function reportMinutes(sections: number, maxTaskMinutes?: number): number | undefined {
  return maxTaskMinutes === undefined ? undefined : sections * maxTaskMinutes;
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
