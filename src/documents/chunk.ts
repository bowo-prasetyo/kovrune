// Splits long documents into chunks that fit a small context window. The agent
// searches and reads chunks; evidence is verified against the whole document.

import type { SourceDocument } from "../tools/search.ts";

/** Chunk size in characters: about 450 tokens, so several fit in a 4,096-token context. */
export const CHUNK_CHARS = 1800;

const CHUNK_SEPARATOR = "#";

/**
 * A document that fits in one chunk keeps its ID and title unchanged. Longer
 * documents become `${id}#${n}` chunks, split at paragraph, then sentence,
 * then word boundaries.
 */
export function chunkDocument(doc: SourceDocument, maxChars = CHUNK_CHARS): SourceDocument[] {
  const text = doc.text.trim();
  if (text.length <= maxChars) return [{ ...doc, text }];

  const pieces: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) pieces.push(current.trim());
    current = "";
  };
  for (const unit of splitUnits(text, maxChars)) {
    if (current && current.length + unit.length + 2 > maxChars) flush();
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
    if (p.length <= maxChars) {
      units.push(p);
      continue;
    }
    let buffer = "";
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      for (const piece of sentence.length > maxChars ? splitWords(sentence, maxChars) : [sentence]) {
        if (buffer && buffer.length + piece.length + 1 > maxChars) {
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
  for (const word of text.split(/\s+/)) {
    if (line && line.length + word.length + 1 > maxChars) {
      out.push(line);
      line = "";
    }
    line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/** The document ID a chunk belongs to (the ID itself for unchunked documents). */
export function parentId(chunkId: string): string {
  const i = chunkId.lastIndexOf(CHUNK_SEPARATOR);
  return i > 0 && /^\d+$/.test(chunkId.slice(i + 1)) ? chunkId.slice(0, i) : chunkId;
}
