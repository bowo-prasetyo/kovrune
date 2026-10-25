// Open research sources (docs/m1-plan.md, slice 4): public services the agent can
// search besides the user's documents. Both allow requests from web pages, so the
// app calls them directly; nothing goes through a Kovrune server.

export interface SourceHit {
  /** Source-prefixed ID, e.g. "wikipedia:Alan_Turing" or "openalex:W2741809807". */
  id: string;
  title: string;
  snippet: string;
}

export interface FetchedDocument {
  id: string;
  title: string;
  text: string;
  url: string;
  /** ISO time the text was retrieved, shown with citations. */
  retrievedAt: string;
  /** Scholarly works: what a reference needs, e.g. for a BibTeX export. */
  work?: WorkInfo;
}

export interface WorkInfo {
  authors: string[];
  year?: number;
  /** Without the "https://doi.org/" prefix. */
  doi?: string;
  /** The journal, conference or repository. */
  venue?: string;
}

export interface OpenSource {
  name: "wikipedia" | "openalex";
  /** Shown to the model and the user, e.g. "Wikipedia". */
  label: string;
  search(query: string, signal?: AbortSignal): Promise<SourceHit[]>;
  fetch(id: string, signal?: AbortSignal): Promise<FetchedDocument>;
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Removes the HTML that search APIs put in snippets, e.g. <span class="searchmatch">. */
export function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export class SourceError extends Error {}

/** Fetches JSON, turning HTTP and network failures into a short message the model and user can read. */
export async function getJson(fetchImpl: FetchLike, label: string, url: string, signal?: AbortSignal): Promise<any> {
  let response;
  try {
    response = await fetchImpl(url, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new SourceError(`${label} could not be reached. Check your internet connection.`);
  }
  // OpenAlex limits how often anonymous users may search; on the class 1 laptop a day of testing hit it.
  if (response.status === 429) throw new SourceError(`${label} is busy (too many requests). Try again in a few minutes.`);
  if (!response.ok) throw new SourceError(`${label} returned an error (HTTP ${response.status}).`);
  return response.json();
}
