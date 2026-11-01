// Report mode, slice 5 (docs/report-mode.md): the introduction and conclusion. They are written by the
// model from the section answers only, in one short constrained call, without new searching or reading.
// Each sentence is then checked as an answer sentence is (support.ts), against the verified quotes of
// the sections, and sentences no quote backs are marked. They never change a section's label.

import { stripThinking, type LanguageModel } from "../models/types.ts";
import type { CheckedEvidence } from "./evidence.ts";
import { sentenceSupport, type SentenceSupport } from "./support.ts";

/** The reply holds two short paragraphs. */
export const SYNTHESIS_MAX_TOKENS = 400;
/** Each section answer is shown up to this many characters, so four long answers fit a 4,096-token context. */
export const SYNTHESIS_ANSWER_CHARS = 1200;
/** Fewer answered sections than this have nothing to introduce or conclude. */
export const MIN_SYNTHESIS_SECTIONS = 2;

export const SYNTHESIS_SYSTEM = "You write the introduction and conclusion of a report from its sections. You add no facts of your own.";

/** A section as the synthesis reads it: its question, answer and checked quotes. */
export interface SynthesisSection {
  question: string;
  answer?: string;
  status: string;
  evidence: CheckedEvidence[];
}

export interface SynthesisPart {
  text: string;
  /** Which sentences the sections' verified quotes back (support.ts). */
  support: SentenceSupport;
}

export interface Synthesis {
  introduction: SynthesisPart;
  conclusion: SynthesisPart;
}

/**
 * Whether reports offer the introduction and conclusion by default, by the model's ID: no model.
 * Decision R4: on by default for a model if their sentences are mostly backed on the report suite
 * (the condition is in docs/report-mode.md). Measured at 4,096 tokens (harness 0.53.0), the sections'
 * quotes back 7 of Qwen3.5-4B's 17 sentences and none of Qwen3.5-2B's 14, and none of either model's 6
 * held out. The plan screen still offers them, unticked.
 */
export function writesSynthesis(_modelId: string): boolean {
  return false;
}

/** Sections that found an answer: the ones an introduction or conclusion may draw on. */
export function answeredSections(sections: SynthesisSection[]): SynthesisSection[] {
  return sections.filter((s) => s.answer?.trim() && (s.status === "verified" || s.status === "unverified"));
}

const clip = (text: string, chars: number) => (text.length > chars ? `${text.slice(0, text.lastIndexOf(" ", chars) > 0 ? text.lastIndexOf(" ", chars) : chars)} …` : text);

/** The prompt: the report's title and request, and each answered section's question and answer. */
export function synthesisPrompt(title: string, request: string, sections: SynthesisSection[]): string {
  return [
    `Report: ${title}`,
    `Request: ${request}`,
    "",
    "Sections:",
    ...sections.flatMap((s, i) => [`${i + 1}. ${s.question}`, clip(s.answer!.trim().replace(/\s+/g, " "), SYNTHESIS_ANSWER_CHARS), ""]),
    "Write an introduction of two or three sentences that says what the report covers, and a conclusion of two or three sentences that sums up what the sections found. Use only what the sections say, in their words where you can: no facts, numbers or names they do not give, and no advice. Write in the language of the request.",
    'Reply with exactly one JSON object: {"introduction":"...","conclusion":"..."}.',
  ].join("\n");
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: { introduction: { type: "string" }, conclusion: { type: "string" } },
  required: ["introduction", "conclusion"],
  additionalProperties: false,
};

/** Reads the two paragraphs from a reply; undefined when it cannot be read or either is empty. */
export function parseSynthesis(text: string): { introduction: string; conclusion: string } | undefined {
  const cleaned = stripThinking(text);
  try {
    const value = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1)) as { introduction?: unknown; conclusion?: unknown };
    const introduction = typeof value.introduction === "string" ? value.introduction.trim() : "";
    const conclusion = typeof value.conclusion === "string" ? value.conclusion.trim() : "";
    return introduction && conclusion ? { introduction, conclusion } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes the introduction and conclusion of a report and checks their sentences against the verified
 * quotes of all its sections. Undefined when fewer than MIN_SYNTHESIS_SECTIONS sections have an
 * answer, or the model's reply cannot be read or the call fails: the report is complete without them.
 */
export async function writeSynthesis(options: {
  model: LanguageModel;
  title: string;
  request: string;
  sections: SynthesisSection[];
  titleFor?: (docId: string) => string | undefined;
  constrained?: boolean;
  signal?: AbortSignal;
}): Promise<Synthesis | undefined> {
  const { model, signal } = options;
  const answered = answeredSections(options.sections);
  if (answered.length < MIN_SYNTHESIS_SECTIONS) return undefined;
  let text = "";
  try {
    for await (const chunk of model.generate({
      messages: [
        { role: "system", content: SYNTHESIS_SYSTEM },
        { role: "user", content: synthesisPrompt(options.title, options.request, answered) },
      ],
      maxTokens: SYNTHESIS_MAX_TOKENS,
      temperature: 0,
      responseSchema: (options.constrained ?? true) && model.supportsConstrainedDecoding() ? RESPONSE_SCHEMA : undefined,
      signal,
    })) {
      text += chunk.text;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
  const parts = parseSynthesis(text);
  if (!parts) return undefined;
  // Every section's quotes, not only the answered ones': a quote is backing wherever it was found.
  const evidence = options.sections.flatMap((s) => s.evidence);
  const check = (part: string): SynthesisPart => ({ text: part, support: sentenceSupport(part, evidence, options.titleFor) });
  return { introduction: check(parts.introduction), conclusion: check(parts.conclusion) };
}

/** Judged and backed sentences over both parts. */
export function synthesisBacking(synthesis: Synthesis): { judged: number; backed: number } {
  const parts = [synthesis.introduction, synthesis.conclusion];
  return { judged: parts.reduce((n, p) => n + p.support.judged, 0), backed: parts.reduce((n, p) => n + p.support.backed, 0) };
}
