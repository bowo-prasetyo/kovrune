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
      // A theorem-like statement moves on with its proof too (harness 0.97.0): a part ending on "Lemma 3.2. If
      // …" and the next starting "Proof. Let B = …" gave the proof without what it proves.
      const statement = PROOF_START.test(unit) ? statementBefore(current) : [];
      const headings = statement.length ? [...trailingHeadings(current.slice(0, current.length - statement.length)), ...statement] : trailingHeadings(current);
      const fits = headings.reduce((sum, h) => sum + textWeight(h) + 2, 0) + textWeight(unit) <= maxChars;
      const carried = fits && headings.length < current.length ? headings : [];
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

/*
 * Proofs across parts (harness 0.97.0), from the mathematician's audit (docs/math-audit.md, M7). A proof runs
 * over several parts of a long paper, and a part in the middle of one said nothing of what it proves: a
 * model reading "Since p - 1 > 5, the map b ↦ 3b - 2r takes at most two values …" could not tell which
 * result it was reading the proof of. A statement is kept with the start of its proof (chunkDocument), and
 * a part that starts inside a proof says whose (proofContinued), as tables and figures say where they are
 * cited (DocumentIndex.tablesCitedElsewhere). A proof ends with "∎", which the LaTeX converter writes where
 * amsthm prints its box, and which PDFs print as "∎", "□" or "■".
 */

/** A theorem-like statement's heading as the LaTeX converter and PDFs write it: "Lemma 3.2 (Key Lemma). If …", "Theorem A. Let …". */
export const STATEMENT_START =
  /^(?:Main )?(Theorem|Lemma|Proposition|Corollary|Claim|Conjecture|Definition|Remark|Example|Fact|Observation|Question|Problem|Assumption|Hypothesis|Notation)(?: ([0-9A-Z][0-9A-Za-z]*(?:\.[0-9A-Za-z]+)*))?(?: \([^)\n]{1,80}\))?\.\s/;
/** A proof's start: "Proof. …", "Proof of Theorem 1.1. …", "Proof (sketch). …". */
export const PROOF_START = /^Proof(?: of (.+?))?(?: \([^)\n]{1,40}\))?\.(?:\s|$)/;
/** A proof's end: the box amsthm prints, as the converter writes it ("∎") or a PDF gives it. */
const PROOF_END = /[∎□■]\s*$/;

/**
 * For each part of a document, in order, the proof it starts inside, if any: what the proof proves ("Theorem
 * 1.1", or the statement before it) and the part where the proof begins. A proof is open from its "Proof"
 * paragraph to the paragraph ending with its box, or to the next statement or heading, whichever comes first.
 */
export function proofsContinued(parts: SourceDocument[]): Array<{ proof: string; partId: string } | undefined> {
  let statement: string | undefined;
  let open: { proof: string; partId: string } | undefined;
  return parts.map((part) => {
    const atStart = open;
    for (const paragraph of part.text.split(/\n\s*\n/).map((p) => p.trim())) {
      if (!paragraph) continue;
      const head = STATEMENT_START.exec(paragraph);
      const proof = PROOF_START.exec(paragraph);
      if (head || /^#{1,6}\s/.test(paragraph)) open = undefined;
      if (head) statement = [head[1], head[2]].filter(Boolean).join(" ");
      if (proof) open = { proof: proof[1]?.trim() || statement || "the statement before it", partId: part.id };
      if (open && PROOF_END.test(paragraph)) open = undefined;
    }
    return atStart;
  });
}

/**
 * The statement a part's paragraphs end with, with the displayed equations it holds ("Lemma 3.3. … For f ∈ L¹,",
 * then "‖f‖₂ ≤ … (3.1)"), when what comes next is its proof: at most three paragraphs, the later ones neither a
 * statement, a proof nor a heading. None when the statement is all the part holds.
 */
function statementBefore(units: string[]): string[] {
  for (let k = units.length - 1; k >= Math.max(1, units.length - 3); k--) {
    if (STATEMENT_START.test(units[k]!)) return units.slice(k);
    if (PROOF_START.test(units[k]!) || /^#{1,6}\s/.test(units[k]!)) return [];
  }
  return [];
}

/**
 * The statement whose proof a place in a document stands in ("Theorem 4.1"), worked out as proofsContinued
 * does, over the paragraphs before it; undefined outside any proof. A proof titled only "Proof" proves the
 * statement before it.
 */
export function proofAt(text: string, offset: number): string | undefined {
  let statement: string | undefined;
  let open: string | undefined;
  const paragraphs = text.slice(0, offset).split(/\n\s*\n/);
  paragraphs.forEach((raw, k) => {
    const paragraph = raw.trim();
    if (!paragraph) return;
    const head = STATEMENT_START.exec(paragraph);
    const proof = PROOF_START.exec(paragraph);
    if (head || /^#{1,6}\s/.test(paragraph)) open = undefined;
    if (head) statement = [head[1], head[2]].filter(Boolean).join(" ");
    if (proof) open = proof[1]?.trim() || statement || "the statement before it";
    // The paragraph the place is in has not ended there, so its box, if any, comes after it.
    if (open && k < paragraphs.length - 1 && PROOF_END.test(paragraph)) open = undefined;
  });
  return open;
}

/** The note on a part that starts inside a proof: "[This part continues the proof of Theorem 1.1, which begins in teller-sets#3.]". */
export function proofNote(continued: { proof: string; partId: string } | undefined): string {
  return continued ? `[This part continues the proof of ${continued.proof}, which begins in ${continued.partId}.]\n` : "";
}

export const PROOF_NOTE_LINE = /\[This part continues the proof of [^\n]*\]\n?/;

/**
 * Speakers' turns in an interview transcript (harness 0.104.0). A transcript gives each turn after its speaker's
 * label, "P07: …", "IV: …", or "Daniel [00:00:08]: …" as the caption reader writes it (transcripts.ts), and a
 * long answer runs over several parts: on a made-up two-person transcript, 7 of 13 parts started inside a turn,
 * with nothing to say whether the interviewer or the participant was speaking (docs/social-sciences-audit.md,
 * S7). A part that starts inside a turn says whose, as a part inside a proof does.
 *
 * A label is a name of up to four words, the first capitalised, or a code such as "P07", at the start of a line,
 * before a colon, with an optional start time in brackets. Lines like "Note: …" or "Methods: …" start that way
 * too, so a document counts as a transcript only when at least two labels each start MIN_TURNS lines.
 */
export const SPEAKER_LABEL = /^((?:\p{Lu}|\p{Lt})[\p{L}\p{N}'’.\-]*(?: [\p{L}\p{N}'’.\-]+){0,3})(?: \[\d{1,2}:\d{2}(?::\d{2})?\])?:\s/u;
/** Lines a label must start, for two labels, for a document to count as a transcript. */
const MIN_TURNS = 3;

/**
 * For each part of a document, in order, the turn it starts inside, if the document is a transcript: the speaker
 * and the part where the turn begins. A part whose first line starts with a label starts a turn of its own.
 */
export function speakersContinued(parts: SourceDocument[]): Array<{ speaker: string; partId: string } | undefined> {
  const speakers = transcriptSpeakers(parts.map((part) => part.text).join("\n"));
  if (!speakers.size) return parts.map(() => undefined);
  const speaking = (label: string | undefined) => label !== undefined && speakers.has(label);
  let turn: { speaker: string; partId: string } | undefined;
  return parts.map((part) => {
    const lines = part.text.split("\n").map((line) => line.trim()).filter(Boolean);
    const first = SPEAKER_LABEL.exec(lines[0] ?? "")?.[1];
    const atStart = turn && !speaking(first) ? turn : undefined;
    for (const line of lines) {
      const label = SPEAKER_LABEL.exec(line)?.[1];
      if (speaking(label)) turn = { speaker: label!, partId: part.id };
    }
    return atStart;
  });
}

/**
 * The speakers of a transcript: the labels (SPEAKER_LABEL) that start MIN_TURNS lines or more, when at least two do;
 * none for a document that is not a transcript.
 */
export function transcriptSpeakers(text: string): Set<string> {
  const counts = new Map<string, number>();
  for (const line of text.split("\n")) {
    const label = SPEAKER_LABEL.exec(line.trim())?.[1];
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const speakers = [...counts].filter(([, n]) => n >= MIN_TURNS).map(([label]) => label);
  return new Set(speakers.length >= 2 ? speakers : []);
}

/** The note on a part that starts inside a speaker's turn: "[This part continues what P07 says, in a turn that begins in interview-t01#2.]". */
export function speakerNote(continued: { speaker: string; partId: string } | undefined): string {
  return continued ? `[This part continues what ${continued.speaker} says, in a turn that begins in ${continued.partId}.]\n` : "";
}

export const SPEAKER_NOTE_LINE = /\[This part continues what [^\n]*\]\n?/;

/**
 * The notes on each part of a document: whose proof it continues (proofsContinued) and whose turn (speakersContinued).
 * Where a part is read, searched or listed, these say what a part that starts mid-way is inside of.
 */
export function partNotes(parts: SourceDocument[]): string[] {
  const proofs = proofsContinued(parts);
  const speakers = speakersContinued(parts);
  return parts.map((_, i) => proofNote(proofs[i]) + speakerNote(speakers[i]));
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
  let previous = "";
  for (const paragraph of text.split(/\n\s*\n/)) {
    const p = paragraph.trim();
    if (!p) continue;
    const before = previous;
    previous = p;
    if (textWeight(p) <= maxChars) {
      units.push(p);
      continue;
    }
    if (isTable(p)) {
      units.push(...splitTable(p, before, maxChars));
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

/** The lines a table's later piece repeats (splitTable): its "(continued)" label and its first row. */
const REPEATED_LEAD = /^\*\*Table\s+[A-Z]?\d+\*\* \(continued\)[^\n]*\n\|[^\n]*\|(?:\n|$)/gm;

/**
 * A part's text without the lines splitTable repeated, for search to index: indexed in every piece of a
 * long table, a caption's words outranked the passages that answer (clinical c01 lost two of its three
 * answer passages to Table 3's later pieces). The model still reads them.
 */
export function withoutRepeatedLead(text: string): string {
  return text.replace(REPEATED_LEAD, "");
}

/** A table as documents/tables.ts and the JATS converters write it: every line a "| … |" row. */
function isTable(paragraph: string): boolean {
  const lines = paragraph.split("\n");
  return lines.length >= 3 && lines.every((line) => /^\|.*\|$/.test(line.trim()));
}

/** A caption paragraph: "**Table 5** Static compression …", or "Table 5." or "Table 5:" as printed. */
const CAPTION = /^(?:\*\*(Table\s+[A-Z]?\d+)\*\*|(Table\s+[A-Z]?\d+)[.:](?!\d))\s*/;

/**
 * A table longer than a part, split between its rows (harness 0.73.0). Split at sentences, then words,
 * a results table was cut in the middle of a row, and the part after the cut began with numbers, with
 * no caption, no column names and no dataset: a model reading it could not tell what a value was, and
 * Qwen3.5-4B never read it (eval/cs/README.md, cs01). Each later piece starts with what names it: the
 * table's label and the first sentence of its caption, marked "(continued)", and the table's first row,
 * which names its columns. Those lines repeat the document's text; a quote of a row is still word for
 * word. A row longer than a part is split at words, as other text is.
 */
function splitTable(table: string, caption: string, maxChars: number): string[] {
  const [header, ...rows] = table.split("\n");
  const match = CAPTION.exec(caption);
  const label = match ? `**${match[1] ?? match[2]}** (continued) ${firstSentence(caption.slice(match[0].length))}`.trim() : "";
  const lead = [label, header!].filter(Boolean).join("\n");
  // The repeated lines may take at most half a part; if they would take more, later pieces go without them.
  const repeat = textWeight(lead) <= maxChars / 2 ? lead : "";
  const pieces: string[] = [];
  let piece = header!;
  for (const row of rows) {
    for (const part of textWeight(row) > maxChars - textWeight(repeat) - 1 ? splitWords(row, maxChars - textWeight(repeat) - 1) : [row]) {
      if (textWeight(piece) + textWeight(part) + 1 > maxChars) {
        pieces.push(piece);
        piece = repeat ? `${repeat}\n${part}` : part;
      } else {
        piece = `${piece}\n${part}`;
      }
    }
  }
  pieces.push(piece);
  return pieces;
}

/** The first sentence of a caption, at most 200 characters, cut at a word. */
function firstSentence(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0]!.trim();
  if (sentence.length <= 200) return sentence;
  return `${sentence.slice(0, 200).replace(/\s+\S*$/, "")} […]`;
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
