// arXiv preprints, read whole. arXiv's own search API allows no requests from web pages (it sends no
// Access-Control-Allow-Origin header), but its PDFs do (Access-Control-Allow-Origin: *). So papers are
// found through OpenAlex, which indexes arXiv, and each paper the model reads is downloaded from
// arxiv.org/pdf and its text extracted with pdf.js, as the user's PDFs are. A long paper is split into
// parts like a long Wikipedia article (SourceSession), and a quote shows its page.

import { OPENALEX_API, openAlexOptions, rebuildAbstract, snippetOf, workInfo, WORK_FIELDS, type Work } from "./openalex.ts";
import { getBytes, getJson, SourceError, type FetchLike, type OpenSource, type WorkInfo } from "./types.ts";

const PREFIX = "arxiv:";

/** arXiv as a source in OpenAlex ("arXiv (Cornell University)"). */
export const ARXIV_OPENALEX_SOURCE = "S4306400194";

/** A PDF download can be several megabytes on a slow connection. */
export const ARXIV_PDF_TIMEOUT_MS = 90_000;

/** An arXiv identifier, new style ("2005.11401") or old ("hep-th/9901001", "math.GT/0309136"), without its version. */
const ID = String.raw`(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?/\d{7})(?:v\d+)?`;
const IN_URL = new RegExp(String.raw`arxiv\.org/(?:abs|pdf)/${ID}`, "i");
const IN_DOI = new RegExp(String.raw`10\.48550/arxiv\.${ID}`, "i");
const BARE = new RegExp(String.raw`^${ID}$`);

/** The OpenAlex fields arXiv needs besides a work's own: where the work is hosted. */
const FIELDS = `${WORK_FIELDS},locations`;

export interface ArxivWork extends Work {
  locations?: Array<{ landing_page_url?: string | null; pdf_url?: string | null } | null> | null;
}

/** The arXiv identifier of an OpenAlex work, from its arXiv links or its arXiv DOI; undefined when it has none. */
export function arxivId(work: ArxivWork): string | undefined {
  const links = [work.primary_location, ...(work.locations ?? [])].flatMap((l) => {
    const location = l as { landing_page_url?: string | null; pdf_url?: string | null } | null | undefined;
    return [location?.landing_page_url, location?.pdf_url];
  });
  for (const link of [...links, work.doi]) {
    const match = link && (IN_URL.exec(link) ?? IN_DOI.exec(link));
    if (match) return match[1];
  }
  return undefined;
}

/** The ID the model sees for an arXiv paper, e.g. "arxiv:2005.11401". */
export function arxivDocId(id: string): string {
  return PREFIX + id;
}

export interface ExtractedPdf {
  text: string;
  pageStarts?: number[];
}

export function createArxiv(options: {
  /** Extracts a PDF's text with pdf.js (extractPdfText). */
  extractPdf: (bytes: Uint8Array) => Promise<ExtractedPdf>;
  /** The user's OpenAlex API key, for the search (openAlexOptions). */
  apiKey?: string;
  fetchImpl?: FetchLike;
}): OpenSource {
  const fetchImpl = options.fetchImpl ?? fetch;
  const { params: auth, options: openAlex } = openAlexOptions(options.apiKey);
  // The works the searches found, by arXiv ID, so a paper read keeps its title, authors and year.
  const found = new Map<string, ArxivWork>();
  return {
    name: "arxiv",
    label: "arXiv",
    async search(query, signal) {
      const params = new URLSearchParams({
        search: query,
        filter: `locations.source.id:${ARXIV_OPENALEX_SOURCE}`,
        "per-page": "5",
        select: FIELDS,
        ...auth,
      });
      const data = await getJson(fetchImpl, "OpenAlex (searching arXiv)", `${OPENALEX_API}?${params}`, signal, openAlex);
      const works: ArxivWork[] = data?.results ?? [];
      return works.flatMap((work) => {
        const id = arxivId(work);
        if (!id) return [];
        found.set(id, work);
        const abstract = rebuildAbstract(work.abstract_inverted_index);
        const year = work.publication_year ? ` (${work.publication_year})` : "";
        return [{ id: arxivDocId(id), title: `${work.display_name ?? "Untitled"}${year}`, snippet: abstract ? snippetOf(abstract) : "No abstract." }];
      });
    },
    async fetch(id, signal) {
      const key = id.slice(PREFIX.length);
      if (!BARE.test(key)) throw new SourceError(`"${id}" is not an arXiv paper ID.`);
      const bytes = await getBytes(fetchImpl, "arXiv", `https://arxiv.org/pdf/${key}`, signal, { timeoutMs: ARXIV_PDF_TIMEOUT_MS });
      let pdf: ExtractedPdf;
      try {
        pdf = await options.extractPdf(bytes);
      } catch {
        throw new SourceError(`The PDF of arXiv paper ${key} could not be read.`);
      }
      if (!pdf.text.trim()) throw new SourceError(`The PDF of arXiv paper ${key} has no text that can be read.`);
      const work = found.get(key.replace(/v\d+$/, ""));
      const info: WorkInfo = work ? workInfo(work) : { authors: [] };
      return {
        id: arxivDocId(key),
        title: work?.display_name ?? pdf.text.trim().split("\n")[0]!.trim().slice(0, 200),
        text: pdf.text,
        url: `https://arxiv.org/abs/${key}`,
        retrievedAt: new Date().toISOString(),
        // The text read is arXiv's, so the reference is to the arXiv version, whatever was published later.
        work: { ...info, venue: "arXiv", doi: `10.48550/arXiv.${key.replace(/v\d+$/, "")}` },
        ...(pdf.pageStarts ? { pageStarts: pdf.pageStarts } : {}),
      };
    },
  };
}
