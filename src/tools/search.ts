// Deterministic BM25 keyword search over a set of documents. The benchmark
// uses it so results depend on the model and not on a retrieval model; the
// app uses the same search over the user's documents.

import { withoutPartLabel } from "../documents/chunk.ts";
import { words } from "../documents/scripts.ts";

export interface SourceDocument {
  id: string;
  title: string;
  text: string;
  /** PDFs: where each page starts in `text` (see extractPdfText). */
  pageStarts?: number[];
}

export interface SearchHit {
  docId: string;
  title: string;
  snippet: string;
}

// "not" and "no" match nothing useful, and "note" stems to "not": a question with "not" found every note.
const STOP_WORDS = new Set(
  "a an and are as at be by did do does for from has have how in is it its no not of on or since that the this to was what when which who why with".split(" "),
);

/**
 * Light suffix stripping so "maintain", "maintains" and "maintained" match. A final "s" after
 * another is part of the word, so "class" and "classes" both give "class".
 */
export function stem(token: string): string {
  if (/\d/.test(token)) return token;
  const match = /^(.{3,}?)(?:ing|ed|es|(?<!s)s|e)$/.exec(token);
  return match ? match[1]! : token;
}

/**
 * Search terms: words in any script (scripts.ts), without English stop words, stemmed. A word
 * joined by "-" or "." also gives its parts, so "llama server" finds "llama-server" and "report"
 * finds a document titled "report.pdf"; a dot between digits ("3.2.0") joins one number.
 */
function tokenize(text: string): string[] {
  const terms: string[] = [];
  for (const word of words(text)) {
    if (STOP_WORDS.has(word)) continue;
    terms.push(stem(word));
    if (!/[-.]/.test(word)) continue;
    for (const part of word.split(/-|\.(?!\d)|(?<!\d)\./)) {
      if (part && !STOP_WORDS.has(part)) terms.push(stem(part));
    }
  }
  return terms;
}

export class DocumentIndex {
  private readonly docs: SourceDocument[];
  private readonly termFreqs: Map<string, number>[];
  private readonly lengths: number[];
  private readonly docFreq = new Map<string, number>();
  private readonly avgLength: number;

  constructor(docs: SourceDocument[]) {
    this.docs = docs;
    this.termFreqs = docs.map((doc) => {
      const freqs = new Map<string, number>();
      // A chunk's part label is not indexed: its "part", "4" and "12" would match any question with a small number.
      const title = withoutPartLabel(doc.title);
      for (const token of tokenize(`${title} ${title} ${doc.text}`)) freqs.set(token, (freqs.get(token) ?? 0) + 1);
      for (const token of freqs.keys()) this.docFreq.set(token, (this.docFreq.get(token) ?? 0) + 1);
      return freqs;
    });
    this.lengths = this.termFreqs.map((f) => [...f.values()].reduce((a, b) => a + b, 0));
    this.avgLength = this.lengths.reduce((a, b) => a + b, 0) / Math.max(docs.length, 1);
  }

  /** Every ID a tool may be given: documents, their parts, and the documents that were split into parts. */
  ids(): string[] {
    const ids = new Set<string>();
    for (const doc of this.docs) {
      ids.add(doc.id);
      const hash = doc.id.lastIndexOf("#");
      if (hash > 0 && /^\d+$/.test(doc.id.slice(hash + 1))) ids.add(doc.id.slice(0, hash));
    }
    return [...ids];
  }

  /** Number of indexed documents and parts. */
  get size(): number {
    return this.docs.length;
  }

  get(docId: string): SourceDocument | undefined {
    return this.docs.find((doc) => doc.id === docId);
  }

  /** IDs of the chunks of a chunked document (`${docId}#1`, `${docId}#2`, ...). */
  partsOf(docId: string): string[] {
    return this.docs.filter((doc) => doc.id.startsWith(`${docId}#`)).map((doc) => doc.id);
  }

  /** Rarer terms carry more weight, in ranking and in choosing snippets. */
  private idf(term: string): number {
    const df = this.docFreq.get(term) ?? 0;
    return Math.log(1 + (this.docs.length - df + 0.5) / (df + 0.5));
  }

  /**
   * The `count` sentences of a text that best match a query, weighted as snippets are, in the order
   * the text has them, each cut to `maxLength` characters. Sentences that share no term with the
   * query are left out, so there may be fewer, or none.
   */
  bestSentences(text: string, query: string, count: number, maxLength = 220): string[] {
    const terms = [...new Set(tokenize(query))];
    return sentencesOf(text)
      .map((sentence, order) => {
        const tokens = new Set(tokenize(sentence));
        return { sentence: sentence.trim(), order, score: terms.filter((t) => tokens.has(t)).reduce((sum, t) => sum + this.idf(t), 0) };
      })
      .filter((s) => s.score > 0)
      .sort((x, y) => y.score - x.score || x.order - y.order)
      .slice(0, count)
      .sort((x, y) => x.order - y.order)
      .map(({ sentence }) => (sentence.length > maxLength ? `${sentence.slice(0, maxLength)}…` : sentence));
  }

  /**
   * The share of a query's terms a document or chunk contains, each weighted by its rarity as search
   * weights it: 1 when it has them all, 0 when it has none or the query has no terms.
   */
  coverage(docId: string, query: string): number {
    const i = this.docs.findIndex((doc) => doc.id === docId);
    const terms = [...new Set(tokenize(query))];
    const total = terms.reduce((sum, t) => sum + this.idf(t), 0);
    if (i < 0 || !total) return 0;
    return terms.filter((t) => this.termFreqs[i]!.has(t)).reduce((sum, t) => sum + this.idf(t), 0) / total;
  }

  search(query: string, limit = 3): SearchHit[] {
    const terms = [...new Set(tokenize(query))];
    const k1 = 1.2;
    const b = 0.75;
    const scored = this.docs.map((doc, i) => {
      let score = 0;
      for (const term of terms) {
        const tf = this.termFreqs[i]!.get(term) ?? 0;
        if (!tf) continue;
        score += (this.idf(term) * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * this.lengths[i]!) / this.avgLength));
      }
      return { doc, score };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, limit)
      .map(({ doc }) => ({ docId: doc.id, title: doc.title, snippet: bestSnippet(doc.text, terms, (t) => this.idf(t)) }));
  }
}

/** A document's sentences, as snippets are chosen from them. */
function sentencesOf(text: string): string[] {
  // "。", "！", "？" and the Devanagari danda "।" end sentences without a space after them.
  return text.split(/(?<=[.!?:])\s+|(?<=[。！？।])\s*|\n+/).filter((s) => s.trim());
}

function bestSnippet(text: string, terms: string[], weight: (term: string) => number, maxLength = 220): string {
  const sentences = sentencesOf(text);
  let best = sentences[0] ?? "";
  let bestScore = -1;
  for (const sentence of sentences) {
    const tokens = new Set(tokenize(sentence));
    const score = terms.filter((t) => tokens.has(t)).reduce((sum, t) => sum + weight(t), 0);
    if (score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  }
  best = best.trim();
  return best.length > maxLength ? `${best.slice(0, maxLength)}…` : best;
}
