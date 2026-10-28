// Evidence check (docs/m1-plan.md): an answer must quote its sources, and each
// quote is verified against the cited document. Small models invent answers, so
// the app shows whether an answer is backed by text that is really there.

import { dropUnspacedGaps, isUnspaced, unspacedCount } from "../documents/scripts.ts";

export interface EvidenceItem {
  docId: string;
  quote: string;
}

export interface CheckedEvidence extends EvidenceItem {
  verified: boolean;
  /** Why a quote did not verify. */
  reason?: string;
  /** For a quote that is close to a passage but not word for word: that passage, marked up against the quote. */
  closest?: DiffPart[];
  /** For a verified quote: the passage as it is in the source, with the text around it. */
  context?: QuoteContext;
}

/** A verified quote in its source: the source's own text before, of, and after the quote. */
export interface QuoteContext {
  before: string;
  passage: string;
  after: string;
  /** Whether text was cut off before `before` or after `after`. */
  more: { before: boolean; after: boolean };
  /** PDFs: the pages the passage is on. */
  pages?: { first: number; last: number };
}

/** A run of words that both texts share, or that only the quote or only the source has. */
export interface DiffPart {
  kind: "same" | "quote-only" | "source-only";
  text: string;
}

export type AnswerStatus = "verified" | "unverified" | "not-found";

/** Quotes shorter than this many words are too weak to count as evidence. */
export const MIN_QUOTE_WORDS = 3;

/**
 * "...", "…" or "[…]" inside a quote: words the model left out. A quote with them verifies when
 * its pieces are in the source in order, each within MAX_ELIDED_CHARS of the one before.
 */
const ELISION = /\s*\[?\s*(?:…|\.{3,})\s*\]?\s*/g;

/** Characters of source text one elision may stand for: enough for the rest of a sentence, not a page. */
export const MAX_ELIDED_CHARS = 200;

/**
 * Words that negate a claim, in English and the other Latin-script languages languages.ts tells
 * apart, matched in normalized text. "No." before a number ("No. 62") is not one. Chinese and
 * Japanese are not covered: their negations (不, ない) are also parts of other words.
 */
const NEGATION =
  /(?<![\p{L}\p{N}])(?:not|no(?!\.\s*\d)|never|none|nor|neither|cannot|nothing|nobody|ne|pas|jamais|aucune?|nicht|kein(?:e[mnrs]?)?|nie|niemals|non|nunca|nada|ning[uú]n[oa]?|não|nao|nenhuma?|niet|geen|nooit)(?![\p{L}\p{N}])|(?<!\p{L})n'(?=\p{L})|\p{L}n't(?!\p{L})/u;

/** Whether a text says "not", "never", "no" or the like (NEGATION). */
export function hasNegation(text: string): boolean {
  return NEGATION.test(normalizeForMatch(text));
}

/** A Markdown inline link or image, "[text](url)" or "![alt](url "title")", with its text in group 1. */
const MARKDOWN_LINK = /!?\[([^\]\n]*)\]\((?:[^()\s]|\([^()\s]*\))*(?:\s+"[^"\n]*")?\)/g;

/** Lower-cases and unifies quotes, dashes and whitespace, so formatting differences do not fail a quote. */
export function normalizeForMatch(text: string): string {
  const unified = text
    // Compatibility forms are the same text: ligatures ("ﬁ" is "fi"), full-width letters, "…" as "...".
    .normalize("NFKC")
    .toLowerCase()
    // Soft hyphens and zero-width characters are invisible, so a model quoting the text leaves them out.
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "")
    // Markdown is compared as it reads, not as it is written: a link or image is its text, and a
    // backslash escape is the character it escapes. Models quote the user guide's
    // "[Node.js](https://nodejs.org/) 22" as "Node.js 22", and its table cell "ss -ltnp \| grep"
    // with a plain "|" (field suite, harness 0.32.0 baselines).
    .replace(MARKDOWN_LINK, "$1")
    .replace(/\\([!-/:-@[-`{-~])/g, "$1")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    // A hyphen between letters is ignored, with any line break after it, so "financial" matches a
    // PDF's "finan-\ncial" or "finan-cial", and "JSON- schema" (a quote of a line break) matches "JSON-schema".
    .replace(/(\p{L})-\s*(?=\p{L})/gu, "$1")
    .replace(/ /g, " ")
    // Markdown emphasis and code marks are formatting, not words: models quoting "**Apps on
    // device**" or "`llama-server`" drop them (field suite, issue #35).
    .replace(/[*`]+|__/g, "")
    // List markers standing alone are layout, not words: slides use "•" and "–" bullets, and
    // models quoting them swap one for the other or drop them.
    .replace(/(^|\s)[-•·▪◦‣●*](?=\s|$)/g, "$1");
  // Whitespace between Chinese or Japanese characters is layout, such as a PDF's line breaks.
  return dropUnspacedGaps(unified).replace(/\s+/g, " ").trim();
}

function stripEdgePunctuation(text: string): string {
  // Also drops the "[…]" that marks a shortened search snippet.
  return text.replace(/^[\s"'.,;:…\[\]-]+|[\s"'.,;:…\[\]-]+$/g, "");
}

/**
 * Checks each quote against its document. `resolveText` returns the full text
 * for a document or chunk ID, or undefined when the ID does not exist;
 * `resolvePageStarts` returns a PDF's page offsets in that text.
 */
export function checkEvidence(
  items: EvidenceItem[],
  resolveText: (docId: string) => string | undefined,
  resolvePageStarts: (docId: string) => number[] | undefined = () => undefined,
): CheckedEvidence[] {
  return items.map((item) => {
    const text = resolveText(item.docId);
    if (text === undefined) return { ...item, verified: false, reason: "the model cited a document ID it never found" };
    const quote = stripEdgePunctuation(normalizeForMatch(item.quote));
    if (wordCount(quote) < MIN_QUOTE_WORDS) {
      return { ...item, verified: false, reason: `quote shorter than ${MIN_QUOTE_WORDS} words` };
    }
    const normalized = normalizeForMatch(text);
    if (containsWords(normalized, quote) || containsElided(normalized, quote)) {
      const context = quoteContext(item.quote, text, resolvePageStarts(item.docId));
      return { ...item, verified: true, ...(context ? { context } : {}) };
    }
    const closest = closestPassage(item.quote, text);
    return { ...item, verified: false, reason: "quote not found in the document", ...(closest ? { closest } : {}) };
  });
}

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{M}\p{N}]/u.test(ch);

/**
 * Whether two neighbouring characters are inside one word, so a quote may not start or end
 * between them. Between characters of a script without spaces (scripts.ts), any place is a boundary.
 */
const inWord = (a: string | undefined, b: string | undefined) => isWordChar(a) && isWordChar(b) && !isUnspaced(a) && !isUnspaced(b);

/**
 * Words in a normalized quote, separated by spaces. In scripts without spaces, every two
 * characters count as one word, about the length of a Chinese or Japanese word.
 */
function wordCount(text: string, isWord: (token: string) => boolean = Boolean): number {
  let count = 0;
  for (const [token] of text.matchAll(/\S+/g)) {
    const unspaced = unspacedCount(token);
    count += unspaced ? Math.ceil(unspaced / 2) : isWord(token) ? 1 : 0;
  }
  return count;
}

/**
 * Where `quote` first occurs in `text` at or after `from`, starting and ending on word boundaries,
 * so a quote cut mid-word (e.g. "can sometimes match hum…") does not match "human"; -1 if nowhere.
 */
function findWords(text: string, quote: string, from = 0): number {
  for (let at = text.indexOf(quote, from); at >= 0; at = text.indexOf(quote, at + 1)) {
    const before = inWord(text[at - 1], quote[0]);
    const after = inWord(text[at + quote.length], quote.at(-1));
    if (!before && !after) return at;
  }
  return -1;
}

function containsWords(text: string, quote: string): boolean {
  return findWords(text, quote) >= 0;
}

/** Whether `part` (such as a short answer, "3776.12 m") is word for word in `quote`, matched as quotes are matched. */
export function quoteHas(quote: string, part: string): boolean {
  const wanted = stripEdgePunctuation(normalizeForMatch(part));
  return wanted.length > 0 && containsWords(normalizeForMatch(quote), wanted);
}

/**
 * Whether a normalized quote that leaves words out ("lumendb ... has been maintained by the tessel
 * foundation") is in `text`: its pieces in order, each on word boundaries and at most
 * MAX_ELIDED_CHARS after the one before. One piece must be MIN_QUOTE_WORDS long on its own, so
 * "the ... of the" does not count as a quote. Left-out text that negates does not count either:
 * "cobble is ... released under the apache-2.0 license" from "Cobble is not released under…"
 * says the opposite of its source.
 */
function containsElided(text: string, quote: string): boolean {
  const pieces = quote.split(ELISION).map(stripEdgePunctuation).filter(hasWordChar);
  if (pieces.length < 2 || Math.max(...pieces.map((piece) => wordCount(piece, hasWordChar))) < MIN_QUOTE_WORDS) return false;
  const [first, ...rest] = pieces as [string, ...string[]];
  for (let at = findWords(text, first); at >= 0; at = findWords(text, first, at + 1)) {
    let end = at + first.length;
    const chained = rest.every((piece) => {
      const next = findWords(text, piece, end);
      if (next < 0 || next - end > MAX_ELIDED_CHARS || NEGATION.test(text.slice(end, next))) return false;
      end = next + piece.length;
      return true;
    });
    if (chained) return true;
  }
  return false;
}

/** Characters of source text shown on each side of a quote in its context. */
const CONTEXT_CHARS = 240;

const hasWordChar = (key: string) => /[\p{L}\p{N}]/u.test(key);

/**
 * Where a quote is in the source text, as character offsets of its first and last word. Words
 * are compared as in the closest-passage diff, so case, quote marks and edge punctuation do not
 * matter, and tokens without letters or digits (list markers, "«", "[…]") are skipped on both sides.
 * For a quote that leaves words out, the span runs from its first piece to its last, so the
 * passage shown includes what the quote left out.
 */
export function locateQuote(quote: string, text: string): { start: number; end: number } | undefined {
  const pieces = quote
    .split(ELISION)
    .map((piece) => piece.split(/\s+/).map(wordKey).filter(hasWordChar))
    .filter((keys) => keys.length);
  if (!pieces.length) return undefined;
  const words = [...text.matchAll(/\S+/g)]
    .map((m) => ({ key: wordKey(m[0]), start: m.index, end: m.index + m[0].length }))
    .filter((w) => hasWordChar(w.key));
  const matchesAt = (keys: string[], i: number) => i + keys.length <= words.length && keys.every((key, j) => words[i + j]!.key === key);
  const [first, ...rest] = pieces as [string[], ...string[][]];
  for (let i = 0; i < words.length; i++) {
    if (!matchesAt(first, i)) continue;
    let last = i + first.length - 1;
    const chained = rest.every((keys) => {
      for (let j = last + 1; j < words.length && words[j]!.start - words[last]!.end <= MAX_ELIDED_CHARS; j++) {
        if (matchesAt(keys, j)) {
          last = j + keys.length - 1;
          return true;
        }
      }
      return false;
    });
    if (chained) return { start: words[i]!.start, end: words[last]!.end };
  }
  // Chinese and Japanese have no spaces to split words at, so a quote from the middle of a
  // sentence is found as it is written.
  const exact = stripEdgePunctuation(quote.trim());
  const at = exact ? text.indexOf(exact) : -1;
  return at >= 0 ? { start: at, end: at + exact.length } : undefined;
}

/** The page an offset is on: the last page starting at or before it. */
function pageAt(offset: number, pageStarts: number[]): number {
  let page = 1;
  for (let n = 0; n < pageStarts.length; n++) if (pageStarts[n]! <= offset) page = n + 1;
  return page;
}

/** A verified quote with the source text around it, cut at word boundaries, and its pages in a PDF. */
export function quoteContext(quote: string, text: string, pageStarts?: number[]): QuoteContext | undefined {
  const at = locateQuote(quote, text);
  if (!at) return undefined;
  let from = Math.max(0, at.start - CONTEXT_CHARS);
  let to = Math.min(text.length, at.end + CONTEXT_CHARS);
  // Cut at whitespace, so no word is shown in part.
  if (from > 0) {
    const space = text.slice(from, at.start).search(/\s/);
    from = space < 0 ? at.start : from + space + 1;
  }
  if (to < text.length) {
    const space = Math.max(...[" ", "\n", "\t"].map((ch) => text.slice(at.end, to).lastIndexOf(ch)));
    to = space < 0 ? at.end : at.end + space;
  }
  return {
    before: text.slice(from, at.start),
    passage: text.slice(at.start, at.end),
    after: text.slice(at.end, to),
    more: { before: from > 0, after: to < text.length },
    ...(pageStarts?.length ? { pages: { first: pageAt(at.start, pageStarts), last: pageAt(at.end - 1, pageStarts) } } : {}),
  };
}

export function answerStatus(found: boolean, checked: CheckedEvidence[]): AnswerStatus {
  if (!found) return "not-found";
  return checked.some((c) => c.verified) ? "verified" : "unverified";
}

/** Below this share of the quote's words, a passage is not worth a look. */
const MIN_SHARED = 0.5;
/**
 * The share of the quote's words that must match the passage in order for it to count as
 * "close". Below it the quote is mostly invented, and a word-by-word diff is noise.
 */
const MIN_IN_ORDER = 0.7;

// A token without letters or digits keeps itself as its key, so "«" and "•" are not paired in the
// diff (seen: "Choose • Papyrus Project »"); list markers all share one key, as in the quote check.
const wordKey = (word: string) => {
  // A link whose text has spaces is split across words: "[Node js](url)" ends in "js](url)".
  const normalized = normalizeForMatch(word.replace(/\]\((?:[^()\s]|\([^()\s]*\))*\)/g, ""));
  const key = normalized.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (key) return key;
  if (/^[-•·▪◦‣●*]$/.test(word.replace(/[‐-―−]/g, "-"))) return "•";
  return word.replace(/[.,;:!?]+$/, "") || word;
};

/**
 * The passage of `text` closest to a quote that is not in it word for word, as a word-level
 * diff, so a reader can see what the model changed. Small models often keep the start of a
 * real sentence and finish it from memory. Returns undefined unless at least 70% of the
 * quote's words appear, in order, in one passage.
 */
export function closestPassage(quote: string, text: string): DiffPart[] | undefined {
  const q = quote.split(/\s+/).filter(Boolean);
  const qKeys = q.map(wordKey);
  const words = text.split(/\s+/).filter(Boolean);
  const keys = words.map(wordKey);
  if (!q.length || !words.length) return undefined;

  // Find the window sharing the most quote words; windows can be shorter or longer than the quote.
  const wanted = new Map<string, number>();
  for (const k of qKeys) wanted.set(k, (wanted.get(k) ?? 0) + 1);
  let best = { start: 0, end: 0, shared: 0 };
  for (const size of new Set([q.length, Math.ceil(q.length * 1.5), Math.ceil(q.length * 2)])) {
    const width = Math.min(size, words.length);
    const have = new Map<string, number>();
    let shared = 0;
    const add = (k: string, d: number) => {
      const before = Math.min(have.get(k) ?? 0, wanted.get(k) ?? 0);
      have.set(k, (have.get(k) ?? 0) + d);
      shared += Math.min(have.get(k)!, wanted.get(k) ?? 0) - before;
    };
    for (let i = 0; i < words.length; i++) {
      add(keys[i]!, 1);
      if (i >= width) add(keys[i - width]!, -1);
      if (i >= width - 1 && shared > best.shared) best = { start: i - width + 1, end: i + 1, shared };
    }
  }
  if (best.shared < q.length * MIN_SHARED) return undefined;

  // Word-level diff of the quote against that window (longest common subsequence).
  const w = keys.slice(best.start, best.end);
  const lcs = Array.from({ length: q.length + 1 }, () => new Array<number>(w.length + 1).fill(0));
  for (let i = q.length - 1; i >= 0; i--) {
    for (let j = w.length - 1; j >= 0; j--) {
      lcs[i]![j] = qKeys[i] === w[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  if (lcs[0]![0]! < q.length * MIN_IN_ORDER) return undefined;
  const steps: Array<{ kind: DiffPart["kind"]; word: string }> = [];
  let i = 0;
  let j = 0;
  while (i < q.length || j < w.length) {
    if (i < q.length && j < w.length && qKeys[i] === w[j]) {
      steps.push({ kind: "same", word: words[best.start + j]! });
      i++;
      j++;
    } else if (j < w.length && (i >= q.length || lcs[i]![j + 1]! > lcs[i + 1]![j]!)) {
      steps.push({ kind: "source-only", word: words[best.start + j]! });
      j++;
    } else {
      steps.push({ kind: "quote-only", word: q[i]! });
      i++;
    }
  }
  // The window's edges can hold source words around the passage; drop them.
  while (steps[0]?.kind === "source-only") steps.shift();
  while (steps.at(-1)?.kind === "source-only") steps.pop();

  const parts: DiffPart[] = [];
  for (const step of steps) {
    const last = parts.at(-1);
    if (last?.kind === step.kind) last.text += ` ${step.word}`;
    else parts.push({ kind: step.kind, text: step.word });
  }
  return parts;
}
