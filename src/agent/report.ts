// Report mode, slice 1 (docs/report-mode.md): planning. A request for a report is turned into a few
// focused questions, one per section, each of which the research agent can answer from one or two
// passages, with the quote checks and labels a question gets. The model is shown the request, the
// sources to be searched and what a search of the user's documents for the request found (the
// source overview), in one short constrained call; the user can then edit the plan before anything
// is researched.

import { mainScript, textWeight, words } from "../documents/scripts.ts";
import { stripThinking, type LanguageModel } from "../models/types.ts";
import { scriptOfLanguage, type Translate } from "../tools/research.ts";
import { translator, type ResearchLibrary } from "./research.ts";

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
  /** The documents the source overview showed the planner, by title: empty when none matched, absent without documents. */
  consulted?: string[];
}

// The source overview. Planned blind, from the request alone, a plan asks what such a report usually
// covers ("tokenomics", "encryption methods"), and those sections end as "not found" (report suite,
// harness 0.51.0). So the planner is first shown what the documents say about the request: the
// sentences that best match it, from the passages a search for it finds, grouped by document.

/** Words that ask for a report rather than say what it is about, left out of the search for its sources. */
const REQUEST_WORDS = new Set(
  "write writing report reports short long brief detailed full overview summary summarize essay article piece words please give make create research nice according".split(" "),
);

/** Passages searched for the request, sentences kept from each, and the overview's size in characters (textWeight). */
export const OVERVIEW_PASSAGES = 6;
export const OVERVIEW_SENTENCES = 3;
export const OVERVIEW_CHARS = 2400;
/** Passages added from each document language written in another script than the request. */
const OVERVIEW_TRANSLATED_PASSAGES = 2;
/**
 * The share of the translated terms (DocumentIndex.coverage) a passage in another script needs to be
 * shown. Chinese and Japanese are searched by single characters and pairs, so nearly any passage
 * shares a few with a translation: without this, every overview of the field documents showed the
 * Great Wall and Mount Fuji, and Qwen3.5-4B planned a section on the Great Wall in a report on the MPL.
 */
export const OVERVIEW_TRANSLATED_COVERAGE = 0.5;

/** Fewer words than this tell the planner nothing ("Roadmap", "data."), except in scripts written without spaces. */
const OVERVIEW_MIN_WORDS = 4;

/** A sentence as the planner is shown it: without Markdown link targets, emphasis, heading marks and table bars. */
export function overviewSentence(sentence: string): string {
  return sentence
    .replace(/\]\([^)]*\)/g, "")
    .replace(/[[\]]|\*\*|^[#>\s-]+/g, "")
    .replace(/\s*\|\s*/g, "; ")
    .replace(/^[;\s]+|[;\s]+$/g, "")
    .replace(/\s+/g, " ");
}

/** The request without the words that ask for a report or its length: what its sources are searched for. */
export function overviewQuery(request: string): string {
  const kept = request.split(/\s+/).filter((word) => {
    const bare = word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    return bare && !REQUEST_WORDS.has(bare) && !/^\d+$/.test(bare);
  });
  return kept.length ? kept.join(" ") : request.trim();
}

export interface SourceOverview {
  /** The overview as the planner is shown it. */
  text: string;
  /** The documents it quotes from, by title, in the order shown. */
  documents: string[];
}

/**
 * What the user's documents say about a request: the passages a search for it finds, as the
 * research agent's search would, with the terms also translated into each document language written
 * in another script, and from each passage the sentences that best match. Undefined when nothing
 * matches.
 */
export async function overviewSources(library: ResearchLibrary, request: string, translate?: Translate): Promise<SourceOverview | undefined> {
  const { index } = library;
  const query = overviewQuery(request);
  const hits = index.search(query, OVERVIEW_PASSAGES).map((hit) => ({ id: hit.docId, query }));
  const script = mainScript(query)?.script;
  if (translate && script) {
    for (const language of library.languages.filter((l) => scriptOfLanguage(l) !== script)) {
      const terms = await translate(query, language);
      if (!terms) continue;
      const found = index
        .search(terms, OVERVIEW_PASSAGES)
        .filter(
          (hit) =>
            mainScript(index.get(hit.docId)!.text)?.script === scriptOfLanguage(language) &&
            !hits.some((h) => h.id === hit.docId) &&
            index.coverage(hit.docId, terms) >= OVERVIEW_TRANSLATED_COVERAGE,
        )
        .slice(0, OVERVIEW_TRANSLATED_PASSAGES);
      hits.push(...found.map((hit) => ({ id: hit.docId, query: terms })));
    }
  }
  const byDocument = new Map<string, string[]>();
  let size = 0;
  for (const hit of hits) {
    const title = library.documentFor(hit.id)!.title;
    const kept = byDocument.get(title) ?? [];
    const sentences = index
      .bestSentences(index.get(hit.id)!.text, hit.query, OVERVIEW_SENTENCES * 2, 200)
      .map(overviewSentence)
      .filter((s) => words(s).length >= OVERVIEW_MIN_WORDS || textWeight(s) > s.length)
      .slice(0, OVERVIEW_SENTENCES);
    for (const sentence of sentences) {
      if (kept.includes(sentence)) continue;
      const weight = textWeight(sentence) + 3;
      if (size + weight > OVERVIEW_CHARS) break;
      kept.push(sentence);
      size += weight;
    }
    if (kept.length) byDocument.set(title, kept);
  }
  if (!byDocument.size) return undefined;
  return {
    text: [...byDocument].map(([title, sentences]) => [`From "${title}":`, ...sentences.map((s) => `- ${s}`)].join("\n")).join("\n"),
    documents: [...byDocument.keys()],
  };
}

/** The planning prompt: the request, the sources to be searched and, when there is one, the source overview. */
export function planPrompt(request: string, sources: string[], sections = DEFAULT_SECTIONS, overview?: string): string {
  return [
    `Request: ${request}`,
    `Sources to be searched: ${sources.join(", ")}`,
    ...(overview ? ["", "What a search of your documents for the request found, the best-matching sentences of each document:", overview] : []),
    "",
    `Plan a report that answers this request in ${sections} sections.${overview ? " Base the sections on what the sources hold: ask about what the sentences above and the documents they come from cover, not about what a report on this subject usually covers." : ""} For each section, write one focused question that one or two passages of a source can answer: one thing to find out, not a request for an essay. Write the questions in the language of the request, without overlap, in the order a report would present them, and give the report a short title.`,
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

/**
 * Asks the model for a plan, showing it the source overview of `library` when one is given and
 * something in it matches; falls back to the request as one section when the reply cannot be read.
 */
export async function planReport(options: {
  model: LanguageModel;
  request: string;
  /** Names of the sources to be searched, as the user sees them ("your documents", "Wikipedia"). */
  sources: string[];
  /** The user's documents, for the source overview. */
  library?: ResearchLibrary;
  sections?: number;
  constrained?: boolean;
  signal?: AbortSignal;
}): Promise<ReportPlan> {
  const { model, signal } = options;
  const overview = options.library?.documents.length ? await overviewSources(options.library, options.request, translator(model, signal)) : undefined;
  let text = "";
  try {
    for await (const chunk of model.generate({
      messages: [
        { role: "system", content: PLAN_SYSTEM },
        { role: "user", content: planPrompt(options.request, options.sources, options.sections, overview?.text) },
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
  const plan = parsePlan(text);
  if (!plan) return fallbackPlan(options.request);
  return options.library?.documents.length ? { ...plan, consulted: overview?.documents ?? [] } : plan;
}
