// Splits long documents into chunks that fit a small context window. The agent
// searches and reads chunks; evidence is verified against the whole document.

import type { SourceDocument } from "../tools/search.ts";
import { textWeight } from "./scripts.ts";

/**
 * Chunk size in English characters: about 450 tokens, so several fit in a 4,096-token context.
 * Sizes are compared by textWeight, so a chunk of Chinese or Japanese holds about 500 characters.
 */
export const CHUNK_CHARS = 1800;

const CHUNK_SEPARATOR = "#";

/**
 * A document that fits in one chunk keeps its ID and title unchanged. Longer
 * documents become `${id}#${n}` chunks, split at paragraph, then sentence,
 * then word boundaries.
 */
export function chunkDocument(doc: SourceDocument, maxChars = CHUNK_CHARS): SourceDocument[] {
  const text = doc.text.trim();
  if (textWeight(text) <= maxChars) return [{ ...doc, text }];

  const pieces: string[] = [];
  let current: string[] = [];
  let weight = 0;
  const add = (unit: string) => {
    weight = current.length ? weight + textWeight(unit) + 2 : textWeight(unit);
    current.push(unit);
  };
  for (const unit of splitUnits(text, maxChars)) {
    if (current.length && weight + textWeight(unit) + 2 > maxChars) {
      // A chunk does not end with the heading of what comes next: it moves on with it, so a table
      // or section is not cut off from its name (eval/field/README.md, "Headings kept with what they introduce").
      // Only if they fit with the paragraph they introduce; otherwise they stay where they are.
      const headings = trailingHeadings(current);
      const fits = headings.reduce((sum, h) => sum + textWeight(h) + 2, 0) + textWeight(unit) <= maxChars;
      const carried = fits ? headings : [];
      pieces.push(current.slice(0, current.length - carried.length).join("\n\n"));
      current = [];
      weight = 0;
      for (const heading of carried) add(heading);
    }
    add(unit);
  }
  if (current.length) pieces.push(current.join("\n\n"));

  return pieces.map((piece, i) => ({
    id: `${doc.id}${CHUNK_SEPARATOR}${i + 1}`,
    title: `${doc.title} (part ${i + 1} of ${pieces.length})`,
    text: piece,
  }));
}

/** A heading-like line is at most this long: a title, a subject name or a label, not a sentence. */
const MAX_HEADING_CHARS = 80;
/** A heading-like paragraph has at most this many lines, as in a page header ("Student Name: …", "Grade: 6", "Third Term"). */
const MAX_HEADING_LINES = 4;

/**
 * Whether a paragraph reads as the heading of what follows: a Markdown heading, or a few short
 * lines none of which ends a sentence ("Mathematics", "Attendance Record:", a page header). Some
 * short lines that are not headings pass too; moving one to the next chunk only moves where the
 * chunks meet, and quotes are checked against the whole document either way.
 */
export function isHeadingLike(paragraph: string): boolean {
  const lines = paragraph.split("\n").map((line) => line.trim());
  if (lines.length > MAX_HEADING_LINES) return false;
  if (lines.length === 1 && /^#{1,6}\s/.test(lines[0]!) && textWeight(lines[0]!) <= MAX_HEADING_CHARS * 2) return true;
  return lines.every((line) => line !== "" && textWeight(line) <= MAX_HEADING_CHARS && !/[.!?;,。！？；，]$/.test(line));
}

/** The heading-like paragraphs at the end of a chunk's paragraphs, unless they are all it holds. */
function trailingHeadings(units: string[]): string[] {
  let n = 0;
  while (n < units.length && isHeadingLike(units[units.length - 1 - n]!)) n++;
  return n < units.length ? units.slice(units.length - n) : [];
}

/** Paragraphs, with any paragraph longer than maxChars broken into sentences or words. */
function splitUnits(text: string, maxChars: number): string[] {
  const units: string[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const p = paragraph.trim();
    if (!p) continue;
    if (textWeight(p) <= maxChars) {
      units.push(p);
      continue;
    }
    let buffer = "";
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      for (const piece of textWeight(sentence) > maxChars ? splitWords(sentence, maxChars) : [sentence]) {
        if (buffer && textWeight(buffer) + textWeight(piece) + 1 > maxChars) {
          units.push(buffer);
          buffer = "";
        }
        buffer = buffer ? `${buffer} ${piece}` : piece;
      }
    }
    if (buffer) units.push(buffer);
  }
  return units;
}

function splitWords(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).flatMap((w) => (textWeight(w) > maxChars ? splitRun(w, maxChars) : [w]))) {
    if (line && textWeight(line) + textWeight(word) + 1 > maxChars) {
      out.push(line);
      line = "";
    }
    line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/**
 * Text without spaces that is longer than a chunk, as in Chinese, Japanese or Thai: cut after the
 * last "。", "！", "？" or "、" that fits, or where the chunk is full.
 */
function splitRun(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (textWeight(rest) > maxChars) {
    let fit = 0;
    let weight = 0;
    for (const ch of rest) {
      weight += textWeight(ch);
      if (weight > maxChars) break;
      fit += ch.length;
    }
    const head = rest.slice(0, Math.max(fit, 1));
    const end = Math.max(...["。", "！", "？", "、"].map((mark) => head.lastIndexOf(mark)));
    const cut = end > 0 ? end + 1 : head.length;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

/** A chunk's title without its " (part 2 of 5)" label: the title of the document it belongs to. */
export function withoutPartLabel(title: string): string {
  return title.replace(/ \(part \d+ of \d+\)$/, "");
}

/** The document ID a chunk belongs to (the ID itself for unchunked documents). */
export function parentId(chunkId: string): string {
  const i = chunkId.lastIndexOf(CHUNK_SEPARATOR);
  return i > 0 && /^\d+$/.test(chunkId.slice(i + 1)) ? chunkId.slice(0, i) : chunkId;
}
