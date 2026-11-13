// Open research sources (docs/m1-plan.md, slice 4): public services the agent can
// search besides the user's documents. Each allows requests from web pages, so the
// app calls them directly; nothing goes through a Kovrune server. arXiv's search API
// does not, so arXiv papers are found through DataCite and read from arXiv's PDFs,
// which do (sources/arxiv.ts).

export interface SourceHit {
  /** Source-prefixed ID, e.g. "wikipedia:Alan_Turing", "openalex:W2741809807", "arxiv:2005.11401", "datacite:10.5281/zenodo.15310522" or "europepmc:MED/38012345". */
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
  /** PDFs: where each page starts in `text`, as for the user's PDFs (extractPdfText). */
  pageStarts?: number[];
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
  name: "wikipedia" | "openalex" | "arxiv" | "datacite" | "europepmc";
  /** Shown to the model and the user, e.g. "Wikipedia". */
  label: string;
  search(query: string, signal?: AbortSignal): Promise<SourceHit[]>;
  fetch(id: string, signal?: AbortSignal): Promise<FetchedDocument>;
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer?(): Promise<ArrayBuffer>;
  headers?: { get(name: string): string | null };
}>;

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

/** How long a source request may take before it counts as failed: the agent waits on it, and so does the user. */
export const SOURCE_TIMEOUT_MS = 20_000;

/** The longest Retry-After a rate-limited request waits for before its one retry; longer ones are not retried. */
export const MAX_RETRY_WAIT_MS = 10_000;

export interface RequestOptions {
  timeoutMs?: number;
  /** Added to the message when the service's requests are used up for hours, e.g. how to get more. */
  limitHint?: string;
}

/**
 * Fetches JSON, turning HTTP and network failures into a short message the model and user can read.
 * A request that takes longer than `timeoutMs` fails. One rate-limited request (HTTP 429) is tried
 * again after the wait the server asks for (Retry-After, at most MAX_RETRY_WAIT_MS; 1 s if it names
 * none): OpenAlex limits how often anonymous users may search, and a short wait usually clears it.
 * A longer wait is said as it is: since 2026, OpenAlex gives requests without an API key a daily
 * budget shared by everyone on the same IP address, and once it is used up it asks for a wait of
 * up to a day (until midnight UTC), which "try again in a few minutes" got wrong.
 */
export async function getJson(fetchImpl: FetchLike, label: string, url: string, signal?: AbortSignal, options: RequestOptions = {}): Promise<any> {
  return request(fetchImpl, label, url, signal, options, (response) => response.json());
}

/** The longest file getBytes downloads: a long paper's PDF is a few megabytes. */
export const MAX_DOWNLOAD_BYTES = 30 * 2 ** 20;

/** Fetches a file's bytes, such as a PDF, with getJson's handling of failures. */
export async function getBytes(fetchImpl: FetchLike, label: string, url: string, signal?: AbortSignal, options: RequestOptions = {}): Promise<Uint8Array> {
  return request(fetchImpl, label, url, signal, options, async (response) => {
    const size = Number(response.headers?.get("content-length") ?? 0);
    if (size > MAX_DOWNLOAD_BYTES) throw new SourceError(`The file from ${label} is too large to read (${Math.round(size / 2 ** 20)} MB).`);
    if (!response.arrayBuffer) throw new SourceError(`${label} returned no file.`);
    return new Uint8Array(await response.arrayBuffer());
  });
}

type SourceResponse = Awaited<ReturnType<FetchLike>>;

/** One request and its body, both under the timeout, with the failures turned into SourceErrors. */
async function request<T>(
  fetchImpl: FetchLike,
  label: string,
  url: string,
  signal: AbortSignal | undefined,
  options: RequestOptions,
  read: (response: SourceResponse) => Promise<T>,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? SOURCE_TIMEOUT_MS;
  for (let attempt = 0; ; attempt++) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const failed = (error: unknown) => {
      if (signal?.aborted) return error;
      if (timeout.signal.aborted) return new SourceError(`${label} did not answer within ${Math.round(timeoutMs / 1000)} seconds. Try again later.`);
      return new SourceError(`${label} could not be reached. Check your internet connection.`);
    };
    try {
      let response;
      try {
        response = await fetchImpl(url, { signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal });
      } catch (error) {
        throw failed(error);
      }
      if (response.status === 429) {
        const header = response.headers?.get("retry-after") ?? null;
        const wait = attempt === 0 ? retryWait(header) : undefined;
        if (wait === undefined) {
          const later = longWait(header);
          if (later) throw new SourceError(`${label} has no requests left for now; they come back in ${later}.${options.limitHint ? ` ${options.limitHint}` : ""}`);
          throw new SourceError(`${label} is busy (too many requests). Try again in a few minutes.`);
        }
        clearTimeout(timer);
        await sleep(wait, signal);
        continue;
      }
      if (!response.ok) throw new SourceError(`${label} returned an error (HTTP ${response.status}).`);
      // The body is read under the same timeout: a response can stall after its headers.
      try {
        return await read(response);
      } catch (error) {
        if (error instanceof SourceError) throw error;
        if (signal?.aborted || timeout.signal.aborted) throw failed(error);
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

/** A Retry-After of an hour or more, in words ("about 22 hours"); undefined for shorter or unreadable ones. */
export function longWait(header: string | null, now = Date.now()): string | undefined {
  if (header === null) return undefined;
  const seconds = /^\d+$/.test(header.trim()) ? Number(header) : (Date.parse(header) - now) / 1000;
  if (!Number.isFinite(seconds) || seconds < 3600) return undefined;
  const hours = Math.round(seconds / 3600);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** The wait a Retry-After header asks for, in milliseconds: seconds or an HTTP date; undefined when too long. */
export function retryWait(header: string | null, now = Date.now()): number | undefined {
  const seconds = header === null ? 1 : /^\d+$/.test(header.trim()) ? Number(header) : (Date.parse(header) - now) / 1000;
  const ms = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 1000;
  return ms <= MAX_RETRY_WAIT_MS ? ms : undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });
}
