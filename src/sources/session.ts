// The open-source documents one research question touches. Fetched text is cached,
// so the evidence check verifies quotes against exactly what the model read, and
// each citation keeps its URL and retrieval time.

import { quoteContext, quoteHas } from "../agent/evidence.ts";
import { chunkDocument, parentId } from "../documents/chunk.ts";
import { outlineOf } from "../documents/outline.ts";
import { DocumentIndex, type SourceDocument } from "../tools/search.ts";
import { SourceError, type FetchedDocument, type OpenSource, type WorkInfo } from "./types.ts";

export interface Citation {
  title: string;
  url: string;
  retrievedAt: string;
  source: string;
  /** Scholarly works: authors, year, DOI and venue. */
  work?: WorkInfo;
}

/** Characters of the document shown on each side of a quote by a short forced read (passage). */
export const PASSAGE_CHARS = 300;

/** "…" or "...", where a quote leaves words out. */
const ELISION = /\s*\[?\s*(?:…|\.{3,})\s*\]?\s*/;

/**
 * The part that holds a quote: the first part containing its longest piece word for word, or failing
 * that the part whose words best match it. The read-first rule sends the model to read what it quoted
 * from a snippet, and the part matching the question was another one: a preview user's arXiv question
 * read five papers that way, each a part away from what it quoted.
 */
export function partQuoted(parts: SourceDocument[], quotes: string[]): SourceDocument | undefined {
  for (const quote of quotes) {
    const piece = quote.split(ELISION).sort((a, b) => b.length - a.length)[0]?.trim();
    if (!piece) continue;
    const holding = parts.find((p) => quoteHas(p.text, piece));
    if (holding) return holding;
  }
  const words = quotes.join(" ");
  if (!words.trim()) return undefined;
  const best = new DocumentIndex(parts).search(words)[0]?.docId;
  return parts.find((p) => p.id === best);
}

/** How an outline is shown after a read part, so that shortening an old read can leave it out (OUTLINE_LINE). */
export function outlineNote(docId: string, outline: string): string {
  return `[Outline of ${docId}, to read another part by its ID such as ${docId}#1: ${outline}]`;
}

/** An outline line at the end of a read (outlineNote). */
export const OUTLINE_LINE = /\n*\[Outline of [^\n]*\]$/;

export class SourceSession {
  readonly sources: OpenSource[];
  /** Stops source requests when the user stops the research. */
  readonly signal?: AbortSignal;
  /** Source failures during the question, e.g. "Wikipedia could not be reached.", shown to the user. */
  readonly errors = new Set<string>();
  private readonly question: string;
  private readonly seen = new Set<string>();
  private readonly fetched = new Map<string, { doc: FetchedDocument; parts: SourceDocument[] }>();
  /** Documents whose outline has been shown: once is enough, and it would crowd the context. */
  private readonly outlined = new Set<string>();

  constructor(sources: OpenSource[], question: string, signal?: AbortSignal) {
    this.sources = sources;
    this.question = question;
    this.signal = signal;
  }

  sourceFor(id: string): OpenSource | undefined {
    return this.sources.find((s) => id.startsWith(`${s.name}:`));
  }

  /**
   * The tool result for reading an open-source document or one of its parts. For a document too long
   * for the context, the part the model names is given, or else the part containing one of `quotes`
   * (what its answer quoted from a search snippet), or else the part that best matches the question.
   */
  async read(id: string, signal = this.signal, quotes: string[] = []): Promise<string> {
    const source = this.sourceFor(id);
    if (!source) return `No document with ID "${id}". Use an ID returned by a search.`;
    let entry;
    try {
      entry = await this.load(parentId(id), source, signal);
    } catch (error) {
      if (error instanceof SourceError) return this.noteError(error.message);
      throw error;
    }
    const { doc, parts } = entry;
    if (parts.length === 1) return `[${doc.id}] ${doc.title}\n${parts[0]!.text}`;
    // A whole article does not fit; give the part that best matches the question.
    const part =
      parts.find((p) => p.id === id) ??
      partQuoted(parts, quotes) ??
      parts.find((p) => p.id === new DocumentIndex(parts).search(this.question)[0]?.docId) ??
      parts[0]!;
    const number = parts.indexOf(part) + 1;
    // The first time a long document is read, its outline: which parts hold its sections and tables.
    const outline = this.outlined.has(doc.id) ? undefined : outlineOf(parts);
    this.outlined.add(doc.id);
    return (
      `[${part.id}] ${doc.title} (part ${number} of ${parts.length})\n${part.text}\n\n` +
      `Other parts: ${doc.id}#1 to ${doc.id}#${parts.length}.` +
      (outline ? `\n${outlineNote(doc.id, outline)}` : "")
    );
  }

  /**
   * The read the read-first rule asks for, short: for each quote found in the document, the passage
   * around it (PASSAGE_CHARS on each side), and the part to read for more. Undefined when no quote is
   * found, so the caller gives the part instead and the model can see what it got wrong. A whole part
   * is about 1,800 characters, and on a slow machine each forced read of one left less room in the
   * context and had the server process the conversation again (eval/field/README.md).
   */
  async passage(id: string, quotes: string[], signal = this.signal): Promise<string | undefined> {
    const source = this.sourceFor(id);
    if (!source || !quotes.length) return undefined;
    let entry;
    try {
      entry = await this.load(parentId(id), source, signal);
    } catch (error) {
      if (error instanceof SourceError) return this.noteError(error.message);
      throw error;
    }
    const { doc, parts } = entry;
    const found = quotes.flatMap((quote) => {
      const context = quoteContext(quote, doc.text, undefined, PASSAGE_CHARS);
      if (!context) return [];
      const part = parts.length > 1 ? partQuoted(parts, [quote]) : undefined;
      const text = `${context.more.before ? "… " : ""}${context.before}${context.passage}${context.after}${context.more.after ? " …" : ""}`;
      return [{ part, text: text.replace(/\s+/g, " ").trim() }];
    });
    if (!found.length) return undefined;
    const more = [...new Set(found.map((f) => f.part?.id).filter((p): p is string => Boolean(p)))];
    return (
      `[${doc.id}] ${doc.title} (the passage${found.length > 1 ? "s" : ""} your answer quoted)\n${[...new Set(found.map((f) => f.text))].join("\n\n")}\n\n` +
      (more.length ? `To see more, read ${more.join(" or ")}.` : `To see more, read ${doc.id}.`)
    );
  }

  /** Records search results, so their IDs become ones the model may read and cite. */
  noteHits(ids: string[]): void {
    for (const id of ids) this.seen.add(id);
  }

  /** IDs the model may read or cite: search results, fetched documents and their parts. */
  knownIds(): string[] {
    const ids = new Set(this.seen);
    for (const [id, { doc, parts }] of this.fetched) {
      ids.add(id);
      ids.add(doc.id);
      for (const part of parts) ids.add(part.id);
    }
    return [...ids];
  }

  /** Records a source failure and returns it as the tool result. */
  noteError(message: string): string {
    this.errors.add(message);
    return message;
  }

  /** Full text of a fetched document or part, for the evidence check. */
  textFor(id: string): string | undefined {
    return this.fetched.get(parentId(id))?.doc.text;
  }

  /** A fetched PDF's page offsets in the text textFor returns (arXiv papers), so a quote shows its page. */
  pageStartsFor(id: string): number[] | undefined {
    return this.fetched.get(parentId(id))?.doc.pageStarts;
  }

  partsOf(id: string): string[] {
    return this.fetched.get(parentId(id))?.parts.map((p) => p.id) ?? [];
  }

  /** Fetches documents the model cited without reading, so their quotes can be checked too. */
  async ensure(ids: string[], signal = this.signal): Promise<void> {
    for (const id of new Set(ids.map(parentId))) {
      const source = this.sourceFor(id);
      if (source && !this.fetched.has(id)) await this.load(id, source, signal).catch((error) => {
        if (!(error instanceof SourceError)) throw error;
      });
    }
  }

  citation(id: string): Citation | undefined {
    const entry = this.fetched.get(parentId(id));
    const source = this.sourceFor(id);
    if (!entry || !source) return undefined;
    const { title, url, retrievedAt, work } = entry.doc;
    return { title, url, retrievedAt, source: source.label, ...(work ? { work } : {}) };
  }

  private async load(id: string, source: OpenSource, signal?: AbortSignal) {
    const cached = this.fetched.get(id);
    if (cached) return cached;
    const doc = await source.fetch(id, signal);
    const entry = { doc, parts: chunkDocument({ id: doc.id, title: doc.title, text: doc.text }) };
    this.fetched.set(id, entry);
    // Wikipedia follows redirects, so the article's own ID can differ from the one asked for.
    this.fetched.set(doc.id, entry);
    return entry;
  }
}
