// Every passage of the user's documents that has the words asked for (harness 0.105.0), found without a model, for
// qualitative coding: "what did my participants say about the rota?" across fifteen transcripts. A question to the
// model reads at most a few passages (three per search, about four parts in a 4,096-token context), so its answer
// quotes some places and misses others; a researcher coding interviews needs all of them, with who said each
// (docs/social-sciences-audit.md, S7). Runs on the documents in the browser and sends nothing anywhere.

import { transcriptSpeakers, SPEAKER_LABEL } from "./chunk.ts";
import { isUnspaced, words } from "./scripts.ts";
import { normalizeForMatch } from "../agent/evidence.ts";
import { stem } from "../tools/search.ts";

export interface PassageDocument {
  id: string;
  /** The name shown for it, such as its file name. */
  name: string;
  text: string;
  /** PDFs and presentations: where each page or slide starts in `text`. */
  pageStarts?: number[];
}

export interface Passage {
  docId: string;
  name: string;
  /** The page or slide it is on, for a document with pages. */
  page?: number;
  /** In a transcript, whose turn it is ("P07", "Daniel"). */
  speaker?: string;
  /** Where the paragraph starts in the document's text. */
  offset: number;
  /** The paragraph, or the part of a long one around its first match. */
  text: string;
}

/** A paragraph longer than this is shown around its first match only. */
const MAX_PASSAGE_CHARS = 600;
/** At most this many passages are returned; `total` says how many there are. */
export const MAX_PASSAGES = 500;

/** What a search asks for: words, each to be in the passage in any form ("rota" finds "rotas"), and "quoted phrases" as written. */
export interface PassageQuery {
  stems: string[];
  phrases: string[];
}

export function parsePassageQuery(query: string): PassageQuery {
  const phrases = [...query.matchAll(/"([^"]+)"|“([^”]+)”/g)].map((m) => normalizeForMatch(m[1] ?? m[2]!)).filter(Boolean);
  const rest = query.replace(/"[^"]*"|“[^”]*”/g, " ");
  const stems: string[] = [];
  for (const word of words(rest)) {
    // Chinese, Japanese and other text without spaces is matched as written, like a phrase.
    if (isUnspaced(word[0]!)) phrases.push(word);
    else stems.push(stem(word));
  }
  return { stems: [...new Set(stems)], phrases: [...new Set(phrases)] };
}

function matches(paragraph: string, query: PassageQuery): boolean {
  const normalized = normalizeForMatch(paragraph);
  if (!query.phrases.every((phrase) => normalized.includes(phrase))) return false;
  if (!query.stems.length) return true;
  const own = new Set(words(paragraph).map(stem));
  return query.stems.every((s) => own.has(s));
}

/** The page an offset is on: the last page starting at or before it. */
function pageAt(offset: number, pageStarts: number[]): number {
  let page = 1;
  for (let n = 0; n < pageStarts.length; n++) if (pageStarts[n]! <= offset) page = n + 1;
  return page;
}

/** A long paragraph cut around its first match, at word boundaries, marked "…" where cut. */
function around(paragraph: string, query: PassageQuery): string {
  if (paragraph.length <= MAX_PASSAGE_CHARS) return paragraph;
  const lower = paragraph.toLowerCase();
  const firsts = [...query.phrases, ...query.stems].map((key) => lower.indexOf(key.toLowerCase())).filter((at) => at >= 0);
  const at = firsts.length ? Math.min(...firsts) : 0;
  let from = Math.max(0, at - MAX_PASSAGE_CHARS / 3);
  let to = Math.min(paragraph.length, from + MAX_PASSAGE_CHARS);
  if (from > 0) from = paragraph.indexOf(" ", from) + 1;
  if (to < paragraph.length) to = Math.max(paragraph.lastIndexOf(" ", to), from + 1);
  return `${from > 0 ? "… " : ""}${paragraph.slice(from, to).trim()}${to < paragraph.length ? " …" : ""}`;
}

/**
 * Every paragraph of the documents that has all the query's words and phrases, in document order, with its page
 * and, in a transcript, its speaker: the label its turn starts with, or the turn's before it when a long turn runs
 * over several paragraphs.
 */
export function findPassages(documents: PassageDocument[], query: string): { passages: Passage[]; total: number } {
  const parsed = parsePassageQuery(query);
  if (!parsed.stems.length && !parsed.phrases.length) return { passages: [], total: 0 };
  const passages: Passage[] = [];
  let total = 0;
  for (const doc of documents) {
    const speakers = transcriptSpeakers(doc.text);
    let speaker: string | undefined;
    for (const match of doc.text.matchAll(/[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g)) {
      const paragraph = match[0].trim();
      if (!paragraph) continue;
      if (speakers.size) {
        const label = SPEAKER_LABEL.exec(paragraph)?.[1];
        if (label && speakers.has(label)) speaker = label;
      }
      if (!matches(paragraph, parsed)) {
        if (speakers.size) for (const line of paragraph.split("\n").slice(1)) speaker = speakerOf(line, speakers) ?? speaker;
        continue;
      }
      total++;
      if (passages.length < MAX_PASSAGES) {
        passages.push({
          docId: doc.id,
          name: doc.name,
          offset: match.index,
          text: around(paragraph, parsed),
          ...(doc.pageStarts?.length ? { page: pageAt(match.index, doc.pageStarts) } : {}),
          ...(speakers.size && speaker ? { speaker } : {}),
        });
      }
      if (speakers.size) for (const line of paragraph.split("\n").slice(1)) speaker = speakerOf(line, speakers) ?? speaker;
    }
  }
  return { passages, total };
}

function speakerOf(line: string, speakers: Set<string>): string | undefined {
  const label = SPEAKER_LABEL.exec(line.trim())?.[1];
  return label && speakers.has(label) ? label : undefined;
}

/** A CSV field, quoted when it holds a comma, a quote or a line break. */
const field = (value: string | number | undefined) => {
  const text = value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The passages as CSV, one row each (document, page, speaker, passage), for a spreadsheet or a coding tool. */
export function passagesCsv(passages: Passage[]): string {
  return ["document,page,speaker,passage", ...passages.map((p) => [p.name, p.page, p.speaker, p.text].map(field).join(","))].join("\r\n") + "\r\n";
}
