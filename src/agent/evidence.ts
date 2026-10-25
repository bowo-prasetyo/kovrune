// Evidence check (docs/m1-plan.md): an answer must quote its sources, and each
// quote is verified against the cited document. Small models invent answers, so
// the app shows whether an answer is backed by text that is really there.

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

/** Lower-cases and unifies quotes, dashes and whitespace, so formatting differences do not fail a quote. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    // List markers standing alone are layout, not words: slides use "•" and "–" bullets, and
    // models quoting them swap one for the other or drop them.
    .replace(/(^|\s)[-•·▪◦‣●*](?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
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
    if (quote.split(" ").filter(Boolean).length < MIN_QUOTE_WORDS) {
      return { ...item, verified: false, reason: `quote shorter than ${MIN_QUOTE_WORDS} words` };
    }
    if (containsWords(normalizeForMatch(text), quote)) {
      const context = quoteContext(item.quote, text, resolvePageStarts(item.docId));
      return { ...item, verified: true, ...(context ? { context } : {}) };
    }
    const closest = closestPassage(item.quote, text);
    return { ...item, verified: false, reason: "quote not found in the document", ...(closest ? { closest } : {}) };
  });
}

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/**
 * Whether `quote` occurs in `text` starting and ending on word boundaries, so a quote
 * cut mid-word (e.g. "can sometimes match hum…") does not match "human".
 */
function containsWords(text: string, quote: string): boolean {
  for (let at = text.indexOf(quote); at >= 0; at = text.indexOf(quote, at + 1)) {
    const before = isWordChar(text[at - 1]) && isWordChar(quote[0]);
    const after = isWordChar(text[at + quote.length]) && isWordChar(quote.at(-1));
    if (!before && !after) return true;
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
 */
export function locateQuote(quote: string, text: string): { start: number; end: number } | undefined {
  const q = quote.split(/\s+/).map(wordKey).filter(hasWordChar);
  if (!q.length) return undefined;
  const words = [...text.matchAll(/\S+/g)]
    .map((m) => ({ key: wordKey(m[0]), start: m.index, end: m.index + m[0].length }))
    .filter((w) => hasWordChar(w.key));
  for (let i = 0; i + q.length <= words.length; i++) {
    if (q.every((key, j) => words[i + j]!.key === key)) return { start: words[i]!.start, end: words[i + q.length - 1]!.end };
  }
  return undefined;
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
  const normalized = normalizeForMatch(word);
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
