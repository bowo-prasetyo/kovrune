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
  let current = "";
  let weight = 0;
  const flush = () => {
    if (current.trim()) pieces.push(current.trim());
    current = "";
    weight = 0;
  };
  for (const unit of splitUnits(text, maxChars)) {
    const unitWeight = textWeight(unit);
    if (current && weight + unitWeight + 2 > maxChars) flush();
    weight = current ? weight + unitWeight + 2 : unitWeight;
    current = current ? `${current}\n\n${unit}` : unit;
  }
  flush();

  return pieces.map((piece, i) => ({
    id: `${doc.id}${CHUNK_SEPARATOR}${i + 1}`,
    title: `${doc.title} (part ${i + 1} of ${pieces.length})`,
    text: piece,
  }));
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
