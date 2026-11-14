// arXiv preprints, read whole. arXiv's own search API allows no requests from web pages (it sends no
// Access-Control-Allow-Origin header), but its PDFs do (Access-Control-Allow-Origin: *). So papers are
// found through DataCite, which registers every arXiv paper's DOI and whose search API allows web pages,
// and each paper the model reads is downloaded from arxiv.org/pdf and its text extracted with pdf.js,
// as the user's PDFs are. A long paper is split into parts like a long Wikipedia article
// (SourceSession), and a quote shows its page. DataCite needs no key and has no daily budget like
// OpenAlex's, and its arXiv records are arXiv's own, with abstracts.

import { snippetOf } from "./openalex.ts";
import { getBytes, getJson, SourceError, type FetchLike, type OpenSource, type WorkInfo } from "./types.ts";

const PREFIX = "arxiv:";

/** DataCite's search, limited to arXiv's records ("arxiv.content", DOI prefix 10.48550). */
export const DATACITE_API = "https://api.datacite.org/dois";
export const DATACITE_ARXIV_CLIENT = "arxiv.content";
/** Only what a search result and a reference need: about half the reply. */
const DATACITE_FIELDS = "titles,descriptions,url,doi,creators,publicationYear";

/** A PDF download can be several megabytes on a slow connection. */
export const ARXIV_PDF_TIMEOUT_MS = 90_000;

/** An arXiv identifier, new style ("2005.11401") or old ("hep-th/9901001", "math.GT/0309136"), without its version. */
const ID = String.raw`(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?/\d{7})(?:v\d+)?`;
const IN_URL = new RegExp(String.raw`arxiv\.org/(?:abs|pdf)/${ID}`, "i");
const IN_DOI = new RegExp(String.raw`10\.48550/arxiv\.${ID}`, "i");
const BARE = new RegExp(String.raw`^${ID}$`);

/** The arXiv identifier in a link or DOI ("https://arxiv.org/abs/2005.11401v2", "10.48550/arXiv.2005.11401"), without its version. */
export function arxivIdIn(text: string): string | undefined {
  return (IN_URL.exec(text) ?? IN_DOI.exec(text))?.[1];
}

/** A DataCite record of an arXiv paper, as far as Kovrune reads it. */
export interface DataCiteRecord {
  id: string;
  attributes: {
    doi?: string;
    url?: string;
    titles?: Array<{ title?: string }>;
    descriptions?: Array<{ description?: string; descriptionType?: string }>;
    creators?: Array<{ name?: string; givenName?: string; familyName?: string }>;
    publicationYear?: number | string;
  };
}

/** The arXiv identifier of a DataCite record, from its arXiv link or its DOI; undefined when it has none. */
export function arxivId(record: DataCiteRecord): string | undefined {
  for (const link of [record.attributes.url, record.attributes.doi, record.id]) {
    const match = link && (IN_URL.exec(link) ?? IN_DOI.exec(link));
    if (match) return match[1];
  }
  return undefined;
}

/** A record's abstract, with its line breaks as spaces. */
function abstractOf(record: DataCiteRecord): string {
  const abstract = record.attributes.descriptions?.find((d) => d.descriptionType === "Abstract")?.description ?? "";
  return abstract.replace(/\s+/g, " ").trim();
}

/** A record's reference details: authors as "Given Family", year, arXiv DOI and venue. */
function recordInfo(record: DataCiteRecord, id: string): WorkInfo {
  const authors = (record.attributes.creators ?? [])
    .map((c) => (c.givenName && c.familyName ? `${c.givenName} ${c.familyName}` : c.name))
    .filter((name): name is string => Boolean(name));
  const year = Number(record.attributes.publicationYear);
  return { authors, ...(Number.isInteger(year) && year > 0 ? { year } : {}), doi: `10.48550/arXiv.${id}`, venue: "arXiv" };
}

/**
 * The search words as a DataCite query. DataCite requires every word of a plain query to match, so
 * the model's longer searches ("RAG marginalization retrieved passages top-K approximation") found
 * nothing; joined with OR and sorted by relevance, papers matching more of the words come first.
 * Characters the query syntax gives meaning to are left out, so a search can't change the query.
 */
export function dataCiteQuery(query: string): string {
  const words = query
    .replace(/[+\-=&|><!(){}[\]^"~*?:\\/]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(and|or|not|to)$/i.test(w));
  return [...new Set(words)].slice(0, 16).join(" OR ");
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
  fetchImpl?: FetchLike;
}): OpenSource {
  const fetchImpl = options.fetchImpl ?? fetch;
  // The records the searches found, by arXiv ID, so a paper read keeps its title, authors and year.
  const found = new Map<string, DataCiteRecord>();
  return {
    name: "arxiv",
    label: "arXiv",
    async search(query, signal) {
      const terms = dataCiteQuery(query);
      if (!terms) return [];
      const params = new URLSearchParams({
        query: terms,
        "client-id": DATACITE_ARXIV_CLIENT,
        sort: "relevance",
        "page[size]": "5",
        "fields[dois]": DATACITE_FIELDS,
      });
      const data = await getJson(fetchImpl, "DataCite (searching arXiv)", `${DATACITE_API}?${params}`, signal);
      const records: DataCiteRecord[] = data?.data ?? [];
      return records.flatMap((record) => {
        const id = arxivId(record);
        if (!id) return [];
        found.set(id, record);
        const abstract = abstractOf(record);
        const year = record.attributes.publicationYear ? ` (${record.attributes.publicationYear})` : "";
        return [{ id: arxivDocId(id), title: `${record.attributes.titles?.[0]?.title ?? "Untitled"}${year}`, snippet: abstract ? snippetOf(abstract) : "No abstract." }];
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
      const bare = key.replace(/v\d+$/, "");
      const record = found.get(bare);
      return {
        id: arxivDocId(key),
        title: record?.attributes.titles?.[0]?.title ?? pdf.text.trim().split("\n")[0]!.trim().slice(0, 200),
        text: pdf.text,
        url: `https://arxiv.org/abs/${key}`,
        retrievedAt: new Date().toISOString(),
        // The text read is arXiv's, so the reference is to the arXiv version, whatever was published later.
        work: record ? recordInfo(record, bare) : { authors: [], doi: `10.48550/arXiv.${bare}`, venue: "arXiv" },
        ...(pdf.pageStarts ? { pageStarts: pdf.pageStarts } : {}),
      };
    },
  };
}
