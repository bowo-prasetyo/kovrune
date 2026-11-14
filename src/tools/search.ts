// Deterministic BM25 keyword search over a set of documents. The benchmark
// uses it so results depend on the model and not on a retrieval model; the
// app uses the same search over the user's documents.

import { withoutPartLabel, withoutRepeatedLead } from "../documents/chunk.ts";
import { words } from "../documents/scripts.ts";
import { definitions } from "./abbreviations.ts";

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
  /** The library's abbreviations (abbreviations.ts): a short form's search term, and the search terms of each long form it stands for. */
  private readonly abbreviations = new Map<string, string[][]>();

  constructor(docs: SourceDocument[]) {
    this.docs = docs;
    this.termFreqs = docs.map((doc) => {
      const freqs = new Map<string, number>();
      // A chunk's part label is not indexed: its "part", "4" and "12" would match any question with a small number.
      const title = withoutPartLabel(doc.title);
      for (const token of tokenize(`${title} ${title} ${withoutRepeatedLead(doc.text)}`)) freqs.set(token, (freqs.get(token) ?? 0) + 1);
      for (const token of freqs.keys()) this.docFreq.set(token, (this.docFreq.get(token) ?? 0) + 1);
      return freqs;
    });
    this.lengths = this.termFreqs.map((f) => [...f.values()].reduce((a, b) => a + b, 0));
    for (const doc of docs) {
      for (const { short, long } of definitions(doc.text)) {
        const [term, ...rest] = tokenize(short);
        const longTerms = [...new Set(tokenize(long))];
        if (!term || rest.length || !longTerms.length) continue;
        const known = this.abbreviations.get(term) ?? [];
        if (!known.some((terms) => terms.join(" ") === longTerms.join(" "))) this.abbreviations.set(term, [...known, longTerms]);
      }
    }
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

  /**
   * The tables a part cites ("Table 4 provides the numerical results…") that are in another part of its
   * document, with that part's ID, in the order the part cites them (harness 0.72.0). Papers discuss a
   * table in the paragraph after it, so search finds the discussion, which gives a difference or a
   * trend, and the table that holds the value is one part before: Qwen3.5-4B read the discussion,
   * found no value and answered "not found" (eval/cs/README.md, cs04 and cs12). A table is where its
   * caption is (TABLE_CAPTION).
   */
  tablesCitedElsewhere(partId: string): Array<{ table: string; partId: string }> {
    const doc = this.get(partId);
    const hash = partId.lastIndexOf("#");
    if (!doc || hash < 0) return [];
    const parts = this.partsOf(partId.slice(0, hash));
    const captions = new Map<string, string>();
    for (const id of parts) {
      for (const match of this.get(id)!.text.matchAll(TABLE_CAPTION)) {
        const label = tableLabel((match[1] ?? match[2])!);
        if (!captions.has(label)) captions.set(label, id);
      }
    }
    const own = new Set([...doc.text.matchAll(TABLE_CAPTION)].map((m) => tableLabel((m[1] ?? m[2])!)));
    const cited: Array<{ table: string; partId: string }> = [];
    for (const match of doc.text.matchAll(TABLE_CITATION)) {
      const label = tableLabel(match[1]!);
      const where = captions.get(label);
      if (where && where !== partId && !own.has(label) && !cited.some((c) => c.table === label)) cited.push({ table: label, partId: where });
    }
    return cited.slice(0, MAX_TABLE_NOTES);
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
      .map(({ sentence }) => cutAtWord(sentence, maxLength));
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

  /**
   * A query's search terms with the abbreviations of the words it uses (harness 0.70.0): a query with
   * all the words of "zero-voltage switching" also searches "ZVS" where a document defines it so, since
   * documents use only the abbreviation after defining it. Not the other way: a query with "Vi-TT" that
   * also searched the eight words of its long form ranked passages by those words over the question's
   * own, and lost three clinical answer passages (bench:retrieval); the passages that use "Vi-TT" match it
   * already.
   */
  expandedTerms(query: string): string[] {
    const terms = new Set(tokenize(query));
    for (const [short, longs] of this.abbreviations) {
      if (!terms.has(short) && longs.some((long) => long.every((term) => terms.has(term)))) terms.add(short);
    }
    return [...terms];
  }

  /**
   * The abbreviations a query gains from expandedTerms, each with the long form's terms the query used:
   * "commitment-bound verification" gives CBV and its three terms.
   */
  private gainedAbbreviations(query: string): Array<{ short: string; long: string[] }> {
    const terms = new Set(tokenize(query));
    const gained: Array<{ short: string; long: string[] }> = [];
    for (const [short, longs] of this.abbreviations) {
      if (terms.has(short)) continue;
      const long = longs.find((l) => l.every((term) => terms.has(term)));
      if (long) gained.push({ short, long });
    }
    return gained;
  }

  search(query: string, limit = 3): SearchHit[] {
    const terms = this.expandedTerms(query);
    const k1 = 1.2;
    const b = 0.75;
    const scored = this.docs.map((doc, i) => {
      let score = 0;
      for (const term of terms) {
        const tf = this.termFreqs[i]!.get(term) ?? 0;
        if (!tf) continue;
        score += (this.idf(term) * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * this.lengths[i]!) / this.avgLength));
      }
      return { doc, i, score };
    });
    const ranked = scored.filter((s) => s.score > 0).sort((x, y) => y.score - x.score);
    const top = ranked.slice(0, limit);
    // A passage that uses only the abbreviation keeps a place (harness 0.72.0). Its query terms are the
    // abbreviation's one against the long form's several, so the passages that spell the term out, which
    // define and discuss it, fill every result before the one that reports on it as "CBV" or "w/o ESCA"
    // (eval/cs/README.md, cs11 and cs22). If no result has the abbreviation without its long form, the
    // best-ranked passage that does takes the last place.
    let kept = 0;
    for (const { short, long } of this.gainedAbbreviations(query)) {
      const shortOnly = (i: number) => this.termFreqs[i]!.has(short) && !long.every((term) => this.termFreqs[i]!.has(term));
      if (top.some((s) => shortOnly(s.i))) continue;
      const candidate = ranked.slice(limit).find((s) => shortOnly(s.i) && !top.includes(s));
      // The last place, or the one before it if an earlier abbreviation took the last; never the first.
      const place = top.length - 1 - kept;
      if (candidate && place >= 1) {
        top[place] = candidate;
        kept++;
      }
    }
    return top.map(({ doc }) => ({ docId: doc.id, title: doc.title, snippet: bestSnippet(doc.text, terms, (t) => this.idf(t)) }));
  }
}

/**
 * A table's caption: a line that starts with "**Table 4**" (Markdown, as the JATS converter writes it) or
 * with "Table 4." or "Table 4:" (as a PDF or Word document prints it). Not "Table 4 provides…", which
 * starts a paragraph about the table.
 */
const TABLE_CAPTION = /^(?:\*\*Table\s+([A-Z]?\d+)\*\*|Table\s+([A-Z]?\d+)[.:](?!\d))/gm;
/** A citation of a table in running text: "Table 4", "Tables 4 and 5" (the first). */
const TABLE_CITATION = /\bTables?\s+([A-Z]?\d+)\b/g;
/** At most this many tables are pointed to after one part. */
const MAX_TABLE_NOTES = 3;
const tableLabel = (number: string) => `Table ${number}`;

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
  return cutAtWord(best, maxLength);
}

/**
 * A sentence longer than `maxLength`, cut after its last whole word that fits and marked "[…]", as
 * OpenAlex snippets are (sources/openalex.ts, harness 0.8.0). Cut mid-word ("…and domain-specifi…"),
 * a model quoted the snippet as it stood, and the quote check rightly refused a quote that ends inside
 * a word: a right answer lost its label (harness 0.72.0, eval/cs/README.md, cs21). The quote check
 * ignores a "[…]" at a quote's edge. A sentence with no space to cut at is cut where it must be.
 */
export function cutAtWord(sentence: string, maxLength: number): string {
  if (sentence.length <= maxLength) return sentence;
  const head = sentence.slice(0, maxLength + 1);
  const space = head.search(/\s\S*$/);
  const cut = space > 0 ? head.slice(0, space) : sentence.slice(0, maxLength);
  return `${cut.replace(/[\s,;:]+$/, "")} […]`;
}
