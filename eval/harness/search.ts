// Deterministic BM25 search over the corpus, so research results depend on the
// model under test and not on a retrieval model.

import type { CorpusDocument } from "../tasks/corpus.ts";

export interface SearchHit {
  docId: string;
  title: string;
  snippet: string;
}

const STOP_WORDS = new Set(
  "a an and are as at be by did do does for from has have how in is it its of on or since that the this to was what when which who why with".split(" "),
);

/** Light suffix stripping so "maintain", "maintains" and "maintained" match. */
function stem(token: string): string {
  if (/\d/.test(token)) return token;
  const match = /^(.{3,}?)(?:ing|ed|es|s|e)$/.exec(token);
  return match ? match[1]! : token;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:[.-][a-z0-9]+)*/g) ?? []).filter((t) => !STOP_WORDS.has(t)).map(stem);
}

export class CorpusIndex {
  private readonly docs: CorpusDocument[];
  private readonly termFreqs: Map<string, number>[];
  private readonly lengths: number[];
  private readonly docFreq = new Map<string, number>();
  private readonly avgLength: number;

  constructor(docs: CorpusDocument[]) {
    this.docs = docs;
    this.termFreqs = docs.map((doc) => {
      const freqs = new Map<string, number>();
      for (const token of tokenize(`${doc.title} ${doc.title} ${doc.text}`)) freqs.set(token, (freqs.get(token) ?? 0) + 1);
      for (const token of freqs.keys()) this.docFreq.set(token, (this.docFreq.get(token) ?? 0) + 1);
      return freqs;
    });
    this.lengths = this.termFreqs.map((f) => [...f.values()].reduce((a, b) => a + b, 0));
    this.avgLength = this.lengths.reduce((a, b) => a + b, 0) / Math.max(docs.length, 1);
  }

  get(docId: string): CorpusDocument | undefined {
    return this.docs.find((doc) => doc.id === docId);
  }

  /** Rarer terms carry more weight, in ranking and in choosing snippets. */
  private idf(term: string): number {
    const df = this.docFreq.get(term) ?? 0;
    return Math.log(1 + (this.docs.length - df + 0.5) / (df + 0.5));
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

function bestSnippet(text: string, terms: string[], weight: (term: string) => number, maxLength = 220): string {
  const sentences = text.split(/(?<=[.!?:])\s+|\n+/).filter((s) => s.trim());
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
