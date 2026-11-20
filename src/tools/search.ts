// Deterministic BM25 keyword search over a set of documents. The benchmark
// uses it so results depend on the model and not on a retrieval model; the
// app uses the same search over the user's documents.

import { parentId, proofNote, proofsContinued, withoutPartLabel, withoutRepeatedLead } from "../documents/chunk.ts";
import { words } from "../documents/scripts.ts";
import { definitions } from "./abbreviations.ts";
import { chemicalNameTerms } from "./chemical-names.ts";

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
/**
 * Greek letters by the names papers also spell them with, so "PPARα" and "PPARalpha" are one term
 * (harness 0.87.0). "μ" is left out: after a number it is the micro prefix ("10 μM"), not a name.
 */
const GREEK_NAMES: Record<string, string> = {
  α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ζ: "zeta", η: "eta", θ: "theta", ι: "iota", κ: "kappa",
  λ: "lambda", ν: "nu", ξ: "xi", ρ: "rho", σ: "sigma", τ: "tau", υ: "upsilon", φ: "phi", χ: "chi", ψ: "psi", ω: "omega",
};
const GREEK_LETTER = new RegExp(`[${Object.keys(GREEK_NAMES).join("")}]`, "gu");
/** A Greek letter's name ending a longer word: "pparalpha", "il1beta". */
const GREEK_NAME_END = new RegExp(`.(${Object.values(GREEK_NAMES).join("|")})$`, "u");
const LETTER_FOR: Record<string, string> = Object.fromEntries(Object.entries(GREEK_NAMES).map(([letter, name]) => [name, letter]));

/**
 * The forms of a gene or protein name that writing it another way gives (harness 0.87.0). A paper writes
 * the name one way and a researcher types another, and the lab suite measured how often that misses: every
 * one of its ten papers is found by the spelling it uses, and 8 of 28 spellings a researcher might type are
 * not (eval/lab/README.md). Two families are bridged here:
 * - **a hyphen or dot inside a name:** a query's "IL-10" also gives "il10", so it finds a paper writing
 *   "IL10". Only the query is expanded: adding these to the index lengthened every document and cost
 *   tasks on three suites (eval/lab/README.md), so a paper writing "IL-10" is still missed by a query
 *   writing "IL10";
 * - **a Greek letter written as its name:** "PPARα" and "PPARalpha" both give "pparalpha".
 * What is not bridged: a letter standing for a Greek one ("Ppara" for "PPARα"), which would need every
 * trailing "a" read as alpha, and a name whose parts differ by more than this ("periostin" for "POSTN").
 */
function nameForms(word: string): string[] {
  const forms: string[] = [];
  if (/[-.]/.test(word)) {
    const joined = word.replace(/[-.]/g, "");
    if (joined && joined !== word) forms.push(joined);
  }
  for (const form of [word, ...forms]) {
    if (GREEK_LETTER.test(form)) forms.push(form.replace(GREEK_LETTER, (letter) => GREEK_NAMES[letter]!));
    // And the other way: a query spelling the letter out, for a paper that uses it ("PPARalpha" for
    // "PPARα"). Only at the end of a longer word, so "alphabet" is not read as a name.
    const spelled = form.match(GREEK_NAME_END);
    if (spelled) forms.push(form.slice(0, -spelled[1]!.length) + LETTER_FOR[spelled[1]!]!);
  }
  return forms;
}

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

/**
 * Two words a query writes apart that a paper may run together: "mec A" for "mecA", "H3K27 me3" for
 * "H3K27me3", "Bm MDH2" for "BmMDH2" (harness 0.87.0). Only a pair that looks like a name is joined — one
 * of the two holds a digit, or one is a single letter — so "cell cycle" and "ZVS load" are left alone, and
 * "T cells" gives a term no document has, which costs a term and matches nothing. Query side only: a
 * document that splits a name is the PDF reader's business (0.70.0 joins the pieces it can).
 */
/** The name forms of each word of a query (nameForms), stemmed, for the index's own spelling to match. */
function queryNameForms(query: string): string[] {
  return words(query)
    .filter((w) => !STOP_WORDS.has(w))
    .flatMap((w) => nameForms(w).filter((f) => !STOP_WORDS.has(f)).map(stem));
}

function joinedPairs(query: string): string[] {
  // A single letter is kept though it is a stop word: "mec A" names a gene, and "a" is its second part.
  const plain = words(query).filter((w) => !STOP_WORDS.has(w) || w.length === 1);
  const joined: string[] = [];
  for (let i = 0; i + 1 < plain.length; i++) {
    const [a, b] = [plain[i]!, plain[i + 1]!];
    // A name a space has split is letters and digits ("H3K27 me3", "Bm MDH2") or has a one-letter part
    // ("mec A"). Anything looser joined ordinary pairs: "ZVS load" gave "zvsload" (tests/abbreviations).
    if (!/\d/.test(a) && !/\d/.test(b) && a.length > 1 && b.length > 1) continue;
    joined.push(stem(a + b));
  }
  return joined;
}

export class DocumentIndex {
  private readonly docs: SourceDocument[];
  private readonly termFreqs: Map<string, number>[];
  private readonly lengths: number[];
  private readonly docFreq = new Map<string, number>();
  private readonly avgLength: number;
  /** For each document, the note of the proof it continues ("[This part continues the proof of Theorem 4.1, …]"), or "". */
  private readonly proofNotes: string[];
  /** The library's abbreviations (abbreviations.ts): a short form's search term, and the search terms of each long form it stands for. */
  private readonly abbreviations = new Map<string, string[][]>();

  constructor(docs: SourceDocument[]) {
    this.docs = docs;
    this.proofNotes = proofNotesOf(docs);
    this.termFreqs = docs.map((doc, i) => {
      const freqs = new Map<string, number>();
      // A chunk's part label is not indexed: its "part", "4" and "12" would match any question with a small number.
      const title = withoutPartLabel(doc.title);
      // A part inside a proof is found by what the proof proves, which it may not name ("Theorem 4.1", harness 0.100.0).
      const proof = /proof of (.*), which begins/.exec(this.proofNotes[i]!)?.[1] ?? "";
      for (const token of tokenize(`${title} ${title} ${proof} ${withoutRepeatedLead(doc.text)}`)) freqs.set(token, (freqs.get(token) ?? 0) + 1);
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
   * document, with that part's ID, in the order the part cites them (harness 0.73.0). Papers discuss a
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

  /**
   * For a part that holds a figure's legend, where that figure is discussed: the first part of the same
   * document that cites it, with that figure's label (harness 0.76.0). A paper gives a figure's values in
   * the prose that cites it, while the legend repeats the design, so search ranks the legend high and the
   * prose that answers is elsewhere: Qwen3.5-4B read Figure 1's legend and Figure 6's, found no value and
   * answered "not found", though the sentence citing "(Figure 1C)" gives both (eval/lab/README.md, l04).
   * The mirror of tablesCitedElsewhere, which points from prose to the table it cites.
   */
  figuresDiscussedElsewhere(partId: string): Array<{ figure: string; partId: string }> {
    const doc = this.get(partId);
    const hash = partId.lastIndexOf("#");
    if (!doc || hash < 0) return [];
    // A part that holds table rows holds values, so it is where an answer is read, not a place to point
    // away from (harness 0.78.0). The CS suite's cs04 reads the part holding Table 4 and the legend of
    // Figure 2: with a note sending it to Figure 2's discussion, 4B gave the right value but quoted the
    // table row from its middle, which is not word for word, and the task failed (eval/cs/README.md).
    if (TABLE_ROW.test(doc.text)) return [];
    const own = [...new Set([...doc.text.matchAll(FIGURE_CAPTION)].map((m) => figureLabel((m[1] ?? m[2])!)))];
    if (!own.length) return [];
    const discussed: Array<{ figure: string; partId: string }> = [];
    for (const id of this.partsOf(partId.slice(0, hash))) {
      if (id === partId) continue;
      const text = this.get(id)!.text;
      // A part that only holds the legend again is no discussion: the citation must stand outside one.
      const legends = new Set([...text.matchAll(FIGURE_CAPTION)].map((m) => figureLabel((m[1] ?? m[2])!)));
      for (const match of text.matchAll(FIGURE_CITATION)) {
        const label = figureLabel(match[1]!);
        if (own.includes(label) && !legends.has(label) && !discussed.some((d) => d.figure === label)) discussed.push({ figure: label, partId: id });
      }
    }
    return discussed.sort((a, b) => own.indexOf(a.figure) - own.indexOf(b.figure)).slice(0, MAX_FIGURE_NOTES);
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
    // A chemical's other spellings (harness 0.94.0): "dichloromethane" also searches "CH2Cl2" and "DCM" (chemical-names.ts).
    const terms = new Set([...tokenize(query), ...joinedPairs(query), ...queryNameForms(query), ...chemicalNameTerms(query, tokenize)]);
    for (const [short, longs] of this.abbreviations) {
      if (!terms.has(short) && longs.some((long) => long.every((term) => terms.has(term)))) terms.add(short);
    }
    return [...terms];
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
    // 0.73.0 gave a passage that uses only an abbreviation the last place when the query spelled the term
    // out; under the rule it gained three tasks and lost two, and 0.77.0 takes it out (eval/cs/README.md).
    // A snippet says whose proof its part continues, as reading the part does: Qwen3.5-4B read the part
    // that ranked first, in another theorem's proof, and answered from its "Step 3" (eval/math/README.md).
    return top.map(({ doc, i }) => ({ docId: doc.id, title: doc.title, snippet: `${this.proofNotes[i]}${bestSnippet(doc.text, terms, (t) => this.idf(t))}` }));
  }
}

/** The proof note (chunk.ts) of each document, worked out over the parts of each chunked document in order. */
function proofNotesOf(docs: SourceDocument[]): string[] {
  const notes = docs.map(() => "");
  const byParent = new Map<string, number[]>();
  docs.forEach((doc, i) => {
    if (!doc.id.includes("#")) return;
    const parent = parentId(doc.id);
    byParent.set(parent, [...(byParent.get(parent) ?? []), i]);
  });
  for (const indices of byParent.values()) {
    proofsContinued(indices.map((i) => docs[i]!)).forEach((continued, k) => (notes[indices[k]!] = proofNote(continued)));
  }
  return notes;
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

/**
 * A figure's legend, as the JATS converter writes it ("*Figure 1: Generation of …*") and as a PDF's text
 * gives it ("Figure 1. Generation of …"). A supplementary figure's legend is not in the document, so only
 * the plain forms are matched.
 */
const FIGURE_CAPTION = /^(?:\*{1,2}Figure\s+([A-Z]?\d+)\*{0,2}[.:]|Figure\s+([A-Z]?\d+)[.:](?!\d))/gm;
/** A citation of a figure in running text: "Figure 1", "Figure 1C", "(Fig. 2A)", "Figures 1 and 2" (the first). */
const FIGURE_CITATION = /\b(?:Figs?\.?|Figures?)\s+([A-Z]?\d+)[A-Z]?\b/g;
/** A row of a Markdown table, as the converters write one: values between bars on their own line. */
const TABLE_ROW = /^\s*\|.*\|/m;
/** At most this many figures are pointed to after one part. */
const MAX_FIGURE_NOTES = 2;
const figureLabel = (number: string) => `Figure ${number}`;

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
 * a word: a right answer lost its label (harness 0.73.0, eval/cs/README.md, cs21). The quote check
 * ignores a "[…]" at a quote's edge. A sentence with no space to cut at is cut where it must be.
 */
export function cutAtWord(sentence: string, maxLength: number): string {
  if (sentence.length <= maxLength) return sentence;
  const head = sentence.slice(0, maxLength + 1);
  const space = head.search(/\s\S*$/);
  const cut = space > 0 ? head.slice(0, space) : sentence.slice(0, maxLength);
  return `${cut.replace(/[\s,;:]+$/, "")} […]`;
}
