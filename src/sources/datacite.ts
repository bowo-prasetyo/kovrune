// DataCite: works registered by research repositories (Zenodo, university repositories, data centres),
// besides arXiv's, which the arXiv source covers. DataCite holds their records, not their text, so a
// search gives titles and abstracts, and reading a work gives its full text only where the file is open
// to web pages: on Zenodo, which hosts most of the works found (59% of the top 20 results in a check of
// 8 questions, eval/field/README.md), the record's PDF is downloaded through Zenodo's API
// (Access-Control-Allow-Origin: *) and its text extracted with pdf.js, as arXiv papers are. Any other
// work is read as its abstract, as OpenAlex works are. Only texts are searched (articles, preprints,
// reports, theses), not datasets or software, whose files can't be quoted.

import { DATACITE_API, DATACITE_ARXIV_CLIENT, dataCiteQuery, type DataCiteRecord, type ExtractedPdf } from "./arxiv.ts";
import { snippetOf } from "./openalex.ts";
import { getBytes, getJson, SourceError, type FetchLike, type FetchedDocument, type OpenSource, type WorkInfo } from "./types.ts";

const PREFIX = "datacite:";

/** The kinds of work searched: texts that can be quoted. */
export const DATACITE_TEXT_TYPES = "text,preprint,report,dissertation,journal-article,conference-paper";
const FIELDS = "titles,descriptions,url,doi,creators,publicationYear,publisher";
/** Records asked for, so that five remain once the versions of one work are kept once: in the check, 12 of the first 20 on one question repeated a title. */
const PAGE_SIZE = 20;
const HITS = 5;

export const ZENODO_API = "https://zenodo.org/api/records";
/** A Zenodo DOI: "10.5281/zenodo.15310522", a version or the concept of all versions. */
const ZENODO_DOI = /^10\.5281\/zenodo\.(\d+)$/i;
/** Larger PDFs are read as their abstract: pdf.js would hold the whole file in memory. */
export const MAX_PDF_BYTES = 20_000_000;
export const ZENODO_PDF_TIMEOUT_MS = 90_000;

/** A DOI as the model can write it: no spaces, and no "#", which marks a part (SourceSession). */
const DOI = /^10\.\d{4,9}\/[^\s#]+$/;

/** DataCite's record with its publisher, which a search names and a reference gives as the venue. */
export interface DataCiteWork extends DataCiteRecord {
  attributes: DataCiteRecord["attributes"] & { publisher?: string | { name?: string } };
}

interface ZenodoRecord {
  files?: Array<{ key?: string; size?: number; links?: { self?: string } }>;
}

/** The ID the model sees for a work, e.g. "datacite:10.5281/zenodo.15310522". */
export function dataciteDocId(doi: string): string {
  return PREFIX + doi.toLowerCase();
}

function doiOf(record: DataCiteRecord): string {
  return (record.attributes.doi ?? record.id).toLowerCase();
}

function titleOf(record: DataCiteRecord): string {
  return record.attributes.titles?.[0]?.title?.trim() || "Untitled";
}

function publisherOf(record: DataCiteWork): string | undefined {
  const publisher = record.attributes.publisher;
  return (typeof publisher === "string" ? publisher : publisher?.name)?.trim() || undefined;
}

/** A record's abstract, or its first description when none is marked as one. */
function abstractOf(record: DataCiteRecord): string {
  const descriptions = record.attributes.descriptions ?? [];
  const abstract = (descriptions.find((d) => d.descriptionType === "Abstract") ?? descriptions[0])?.description ?? "";
  return abstract.replace(/\s+/g, " ").trim();
}

function authorsOf(record: DataCiteRecord): string[] {
  return (record.attributes.creators ?? [])
    .map((c) => (c.givenName && c.familyName ? `${c.givenName} ${c.familyName}` : c.name))
    .filter((name): name is string => Boolean(name));
}

function workInfo(record: DataCiteWork): WorkInfo {
  const year = Number(record.attributes.publicationYear);
  const venue = publisherOf(record);
  return { authors: authorsOf(record), ...(Number.isInteger(year) && year > 0 ? { year } : {}), doi: doiOf(record), ...(venue ? { venue } : {}) };
}

/** The text of a work read as its record: title, authors, year, repository, DOI and abstract, and why there is no more. */
export function recordText(record: DataCiteWork, why: string): string {
  const authors = authorsOf(record);
  const lines = [
    titleOf(record),
    [authors.slice(0, 5).join(", ") + (authors.length > 5 ? " et al." : ""), record.attributes.publicationYear, publisherOf(record)].filter(Boolean).join(". "),
    `DOI: ${doiOf(record)}`,
  ];
  const abstract = abstractOf(record);
  lines.push(abstract ? `Abstract: ${abstract}` : "DataCite has no abstract for this work.");
  lines.push(`(${why})`);
  return lines.filter(Boolean).join("\n");
}

/**
 * DataCite as an open source. A search matches any of the words (dataCiteQuery), without arXiv's
 * records. Versions of one work have their own DOIs and the same title (a third of the results in the
 * check), so a search keeps the first of each title.
 */
export function createDataCite(options: {
  /** Extracts a PDF's text with pdf.js (extractPdfText). */
  extractPdf: (bytes: Uint8Array) => Promise<ExtractedPdf>;
  fetchImpl?: FetchLike;
}): OpenSource {
  const fetchImpl = options.fetchImpl ?? fetch;
  const found = new Map<string, DataCiteWork>();

  async function recordFor(doi: string, signal?: AbortSignal): Promise<DataCiteWork> {
    const known = found.get(doi);
    if (known) return known;
    const params = new URLSearchParams({ "fields[dois]": FIELDS });
    const data = await getJson(fetchImpl, "DataCite", `${DATACITE_API}/${encodeURIComponent(doi)}?${params}`, signal);
    const record = data?.data as DataCiteWork | undefined;
    if (!record) throw new SourceError(`DataCite has no work with DOI ${doi}.`);
    found.set(doi, record);
    return record;
  }

  /** The text of a Zenodo work's first PDF, or why it can't be read. */
  async function zenodoText(recordId: string, signal?: AbortSignal): Promise<ExtractedPdf | string> {
    let zenodo: ZenodoRecord;
    try {
      // A concept DOI's record redirects to its latest version.
      zenodo = await getJson(fetchImpl, "Zenodo", `${ZENODO_API}/${recordId}`, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      return "Zenodo did not give this work's files, so only its record was read.";
    }
    const pdf = (zenodo.files ?? []).find((f) => f.key?.toLowerCase().endsWith(".pdf") && f.links?.self);
    if (!pdf) return "This work has no PDF on Zenodo, so only its record was read.";
    if ((pdf.size ?? 0) > MAX_PDF_BYTES) return "This work's PDF is too large to read here, so only its record was read.";
    let bytes: Uint8Array;
    try {
      bytes = await getBytes(fetchImpl, "Zenodo", pdf.links!.self!, signal, { timeoutMs: ZENODO_PDF_TIMEOUT_MS });
    } catch (error) {
      if (signal?.aborted) throw error;
      return "This work's PDF could not be downloaded from Zenodo, so only its record was read.";
    }
    try {
      const text = await options.extractPdf(bytes);
      return text.text.trim() ? text : "This work's PDF has no text that can be read, so only its record was read.";
    } catch {
      return "This work's PDF could not be read, so only its record was read.";
    }
  }

  return {
    name: "datacite",
    label: "DataCite",
    async search(query, signal) {
      const terms = dataCiteQuery(query);
      if (!terms) return [];
      const params = new URLSearchParams({
        query: `(${terms}) AND NOT client_id:${DATACITE_ARXIV_CLIENT}`,
        "resource-type-id": DATACITE_TEXT_TYPES,
        sort: "relevance",
        "page[size]": String(PAGE_SIZE),
        "fields[dois]": FIELDS,
      });
      const data = await getJson(fetchImpl, "DataCite", `${DATACITE_API}?${params}`, signal);
      const records: DataCiteWork[] = data?.data ?? [];
      const titles = new Set<string>();
      const hits = [];
      for (const record of records) {
        const doi = doiOf(record);
        const title = titleOf(record);
        const key = title.toLowerCase().replace(/\W+/g, " ").trim();
        if (!DOI.test(doi) || titles.has(key)) continue;
        titles.add(key);
        found.set(doi, record);
        const about = [record.attributes.publicationYear, publisherOf(record)].filter(Boolean).join(", ");
        const abstract = abstractOf(record);
        hits.push({ id: dataciteDocId(doi), title: about ? `${title} (${about})` : title, snippet: abstract ? snippetOf(abstract) : "No abstract." });
        if (hits.length === HITS) break;
      }
      return hits;
    },
    async fetch(id, signal) {
      const doi = id.slice(PREFIX.length).toLowerCase();
      if (!DOI.test(doi)) throw new SourceError(`"${id}" is not a DataCite DOI.`);
      const record = await recordFor(doi, signal);
      const zenodoId = ZENODO_DOI.exec(doi)?.[1];
      const pdf = zenodoId ? await zenodoText(zenodoId, signal) : "Its full text is on the repository's own site, so only its record was read.";
      const base: Omit<FetchedDocument, "text"> = {
        id: dataciteDocId(doi),
        title: titleOf(record),
        url: record.attributes.url ?? `https://doi.org/${doi}`,
        retrievedAt: new Date().toISOString(),
        work: workInfo(record),
      };
      if (typeof pdf === "string") return { ...base, text: recordText(record, pdf) };
      return { ...base, text: pdf.text, ...(pdf.pageStarts ? { pageStarts: pdf.pageStarts } : {}) };
    },
  };
}
