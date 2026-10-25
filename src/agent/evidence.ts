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
 * for a document or chunk ID, or undefined when the ID does not exist.
 */
export function checkEvidence(items: EvidenceItem[], resolveText: (docId: string) => string | undefined): CheckedEvidence[] {
  return items.map((item) => {
    const text = resolveText(item.docId);
    if (text === undefined) return { ...item, verified: false, reason: "the model cited a document ID it never found" };
    const quote = stripEdgePunctuation(normalizeForMatch(item.quote));
    if (quote.split(" ").filter(Boolean).length < MIN_QUOTE_WORDS) {
      return { ...item, verified: false, reason: `quote shorter than ${MIN_QUOTE_WORDS} words` };
    }
    if (containsWords(normalizeForMatch(text), quote)) return { ...item, verified: true };
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
