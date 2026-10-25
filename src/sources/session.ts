// The open-source documents one research question touches. Fetched text is cached,
// so the evidence check verifies quotes against exactly what the model read, and
// each citation keeps its URL and retrieval time.

import { chunkDocument, parentId } from "../documents/chunk.ts";
import { DocumentIndex, type SourceDocument } from "../tools/search.ts";
import { SourceError, type FetchedDocument, type OpenSource } from "./types.ts";

export interface Citation {
  title: string;
  url: string;
  retrievedAt: string;
  source: string;
}

export class SourceSession {
  readonly sources: OpenSource[];
  /** Stops source requests when the user stops the research. */
  readonly signal?: AbortSignal;
  /** Source failures during the question, e.g. "Wikipedia could not be reached.", shown to the user. */
  readonly errors = new Set<string>();
  private readonly question: string;
  private readonly fetched = new Map<string, { doc: FetchedDocument; parts: SourceDocument[] }>();

  constructor(sources: OpenSource[], question: string, signal?: AbortSignal) {
    this.sources = sources;
    this.question = question;
    this.signal = signal;
  }

  sourceFor(id: string): OpenSource | undefined {
    return this.sources.find((s) => id.startsWith(`${s.name}:`));
  }

  /** The tool result for reading an open-source document or one of its parts. */
  async read(id: string, signal = this.signal): Promise<string> {
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
      parts.find((p) => p.id === new DocumentIndex(parts).search(this.question)[0]?.docId) ??
      parts[0]!;
    const number = parts.indexOf(part) + 1;
    return (
      `[${part.id}] ${doc.title} (part ${number} of ${parts.length})\n${part.text}\n\n` +
      `Other parts: ${doc.id}#1 to ${doc.id}#${parts.length}.`
    );
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
    return { title: entry.doc.title, url: entry.doc.url, retrievedAt: entry.doc.retrievedAt, source: source.label };
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
