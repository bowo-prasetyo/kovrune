// Report mode, slice 1 (docs/report-mode.md): planning. A request for a report is turned into a few
// focused questions, one per section, each of which the research agent can answer from one or two
// passages, with the quote checks and labels a question gets. The model is shown the request and the
// sources to be searched, not the documents, in one short constrained call; the user can then edit
// the plan before anything is researched.

import { stripThinking, type LanguageModel } from "../models/types.ts";

/** Sections a plan asks for by default, and the fewest and most a plan may have (decision R3). */
export const DEFAULT_SECTIONS = 4;
export const MIN_SECTIONS = 2;
export const MAX_SECTIONS = 8;

/** A plan is a title and a few questions; this bounds the reply. */
export const PLAN_MAX_TOKENS = 400;

export const PLAN_SYSTEM = "You plan research reports. Each section of a report answers one focused question from the sources.";

export interface ReportPlan {
  title: string;
  /** One question per section, in report order. */
  sections: string[];
  /** True when the model's plan could not be read, and the request is the only section. */
  fallback?: boolean;
}

/** The planning prompt: the request and the sources to be searched, not the documents. */
export function planPrompt(request: string, sources: string[], sections = DEFAULT_SECTIONS): string {
  return [
    `Request: ${request}`,
    `Sources to be searched: ${sources.join(", ")}`,
    "",
    `Plan a report that answers this request in ${sections} sections. For each section, write one focused question that one or two passages of a source can answer: one thing to find out, not a request for an essay. Write the questions in the language of the request, without overlap, in the order a report would present them, and give the report a short title.`,
    'Reply with exactly one JSON object: {"title":"...","sections":[{"question":"..."}]}.',
  ].join("\n");
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    sections: {
      type: "array",
      minItems: MIN_SECTIONS,
      maxItems: MAX_SECTIONS,
      items: { type: "object", properties: { question: { type: "string" } }, required: ["question"], additionalProperties: false },
    },
  },
  required: ["title", "sections"],
  additionalProperties: false,
};

/** The request as a plan of one section: what a question does today, when no plan can be read. */
export function fallbackPlan(request: string): ReportPlan {
  return { title: request.trim(), sections: [request.trim()], fallback: true };
}

/**
 * Reads a plan from a reply: the JSON asked for, with empty and repeated questions dropped and at most
 * MAX_SECTIONS kept. Undefined when it cannot be read or leaves fewer than MIN_SECTIONS questions.
 */
export function parsePlan(text: string): ReportPlan | undefined {
  const cleaned = stripThinking(text);
  try {
    const value = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1)) as { title?: unknown; sections?: unknown };
    if (typeof value.title !== "string" || !Array.isArray(value.sections)) return undefined;
    const seen = new Set<string>();
    const sections: string[] = [];
    for (const section of value.sections) {
      const question = typeof section?.question === "string" ? section.question.trim() : "";
      const key = question.toLowerCase().replace(/\s+/g, " ");
      if (!question || seen.has(key)) continue;
      seen.add(key);
      sections.push(question);
    }
    if (sections.length < MIN_SECTIONS) return undefined;
    return { title: value.title.trim() || sections[0]!, sections: sections.slice(0, MAX_SECTIONS) };
  } catch {
    return undefined;
  }
}

/** Asks the model for a plan; falls back to the request as one section when the reply cannot be read. */
export async function planReport(options: {
  model: LanguageModel;
  request: string;
  /** Names of the sources to be searched, as the user sees them ("your documents", "Wikipedia"). */
  sources: string[];
  sections?: number;
  constrained?: boolean;
  signal?: AbortSignal;
}): Promise<ReportPlan> {
  const { model, signal } = options;
  let text = "";
  try {
    for await (const chunk of model.generate({
      messages: [
        { role: "system", content: PLAN_SYSTEM },
        { role: "user", content: planPrompt(options.request, options.sources, options.sections) },
      ],
      maxTokens: PLAN_MAX_TOKENS,
      temperature: 0,
      responseSchema: (options.constrained ?? true) && model.supportsConstrainedDecoding() ? RESPONSE_SCHEMA : undefined,
      signal,
    })) {
      text += chunk.text;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    return fallbackPlan(options.request);
  }
  return parsePlan(text) ?? fallbackPlan(options.request);
}
