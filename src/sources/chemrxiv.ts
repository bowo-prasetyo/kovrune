// ChemRxiv (harness 0.99.0): chemistry's preprint server, found through Crossref, recommendation 5 of the
// chemistry researcher's audit. ChemRxiv registers its preprints' DOIs (prefix 10.26434) with Crossref, not
// DataCite, so the DataCite source never finds them; Crossref's REST API (api.crossref.org) gives each
// preprint's title, authors, date and, for most, its abstract, and says when it was published in a journal.
//
// A search is limited to ChemRxiv's preprints. Each version of a preprint has its own DOI ("…-v2") and the
// same title, so a search keeps the first of each title. Reading a preprint gives its record and abstract:
// its full text is on chemrxiv.org, which this source does not read.

import { snippetOf } from "./openalex.ts";
import { getJson, SourceError, type FetchLike, type FetchedDocument, type OpenSource, type SourceHit, type WorkInfo } from "./types.ts";

export const CROSSREF_API = "https://api.crossref.org/works";
/** ChemRxiv's DOI prefix, as Cambridge Open Engage registers it. */
export const CHEMRXIV_PREFIX = "10.26434";
const PREFIX = "chemrxiv:";
/** Records asked for, so that five remain once a preprint's versions are kept once. */
const ROWS = 20;
const HITS = 5;
/** The fields a search asks for. Crossref refuses a search naming a field it cannot select (checked live, 2026-11-20: "subtype" gave HTTP 400). */
const SELECT = "DOI,title,author,abstract,posted,issued,created,relation";

/** A ChemRxiv DOI as the model can write it: "10.26434/chemrxiv-2023-k3l5x-v2". */
const DOI = /^10\.26434\/[^\s#]+$/i;

export interface CrossrefWork {
  DOI: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string }>;
  abstract?: string;
  posted?: { "date-parts"?: number[][] };
  issued?: { "date-parts"?: number[][] };
  created?: { "date-parts"?: number[][] };
  relation?: Record<string, Array<{ "id-type"?: string; id?: string }>>;
}

/** The ID the model sees for a preprint, "chemrxiv:10.26434/chemrxiv-2023-k3l5x-v2". */
export function chemrxivDocId(doi: string): string {
  return PREFIX + doi.toLowerCase();
}

/**
 * Crossref's query: the words of the query without Crossref's few special characters. Crossref ranks
 * works by how many of the words they have, so a question in words works as written.
 */
export function crossrefQuery(query: string): string {
  return query.replace(/[^\p{L}\p{N}\s\-.,']/gu, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

/** A JATS abstract ("<jats:p>…</jats:p>") as text, with its paragraphs on lines of their own. */
export function abstractText(jats: string | undefined): string {
  if (!jats) return "";
  return jats
    .replace(/<jats:title>\s*Abstract\s*<\/jats:title>/gi, "")
    .replace(/<\/jats:p>\s*/gi, "\n")
    .replace(/<jats:sub>(.*?)<\/jats:sub>/gi, "$1")
    .replace(/<jats:sup>(.*?)<\/jats:sup>/gi, "^$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function titleOf(work: CrossrefWork): string {
  return work.title?.[0]?.replace(/\s+/g, " ").trim() || "Untitled";
}

function yearOf(work: CrossrefWork): number | undefined {
  const year = (work.posted ?? work.issued ?? work.created)?.["date-parts"]?.[0]?.[0];
  return typeof year === "number" && year > 0 ? year : undefined;
}

function authorsOf(work: CrossrefWork): string[] {
  return (work.author ?? []).map((a) => (a.given && a.family ? `${a.given} ${a.family}` : a.family ?? a.name)).filter((n): n is string => Boolean(n));
}

/** The journal version a preprint became, by DOI, when Crossref records one. */
export function publishedAs(work: CrossrefWork): string | undefined {
  return work.relation?.["is-preprint-of"]?.find((r) => r["id-type"] === "doi" && r.id)?.id?.toLowerCase();
}

export function workInfo(work: CrossrefWork): WorkInfo {
  const year = yearOf(work);
  return { authors: authorsOf(work), ...(year ? { year } : {}), doi: work.DOI.toLowerCase(), venue: "ChemRxiv" };
}

/** A preprint's text: title, authors, date and DOI, its abstract, the journal version, and that this is the record only. */
export function preprintText(work: CrossrefWork): string {
  const authors = authorsOf(work);
  const year = yearOf(work);
  const published = publishedAs(work);
  const abstract = abstractText(work.abstract);
  return [
    titleOf(work),
    [authors.slice(0, 8).join(", ") + (authors.length > 8 ? " et al." : ""), year, "ChemRxiv preprint"].filter(Boolean).join(". "),
    `DOI: ${work.DOI.toLowerCase()}`,
    ...(published ? [`Published in a journal as DOI ${published}.`] : []),
    abstract ? `Abstract: ${abstract}` : "Crossref has no abstract for this preprint.",
    "(This is the preprint's record from Crossref; its full text is on chemrxiv.org, which was not read.)",
  ].join("\n");
}

/**
 * ChemRxiv as an open source, through Crossref. A DOI in the query is looked up directly; otherwise the
 * query's words are searched among ChemRxiv's preprints (Crossref's filter on the DOI prefix and on
 * posted content), and the first of each title is kept.
 */
export function createChemRxiv(fetchImpl: FetchLike = fetch): OpenSource {
  const label = "ChemRxiv";
  const found = new Map<string, CrossrefWork>();

  async function workFor(doi: string, signal?: AbortSignal): Promise<CrossrefWork> {
    const known = found.get(doi);
    if (known) return known;
    let data;
    try {
      data = await getJson(fetchImpl, "Crossref", `${CROSSREF_API}/${encodeURIComponent(doi)}`, signal);
    } catch (error) {
      if (error instanceof SourceError && error.status === 404) throw new SourceError(`Crossref has no work with DOI ${doi}.`, 404);
      throw error;
    }
    const work = data?.message as CrossrefWork | undefined;
    if (!work?.DOI) throw new SourceError(`Crossref has no work with DOI ${doi}.`);
    found.set(doi, work);
    return work;
  }

  return {
    name: "chemrxiv",
    label,
    async search(query, signal) {
      const named = /10\.26434\/[^\s"'<>]+/i.exec(query)?.[0]?.replace(/[.,;)]+$/, "").toLowerCase();
      if (named) {
        try {
          const work = await workFor(named, signal);
          return [{ id: chemrxivDocId(work.DOI), title: titleOf(work), snippet: snippetOf(abstractText(work.abstract)) || "No abstract." }];
        } catch (error) {
          if (!(error instanceof SourceError && error.status === 404)) throw error;
        }
      }
      const words = crossrefQuery(query);
      if (!words) return [];
      const params = new URLSearchParams({ query: words, filter: `prefix:${CHEMRXIV_PREFIX},type:posted-content`, rows: String(ROWS), select: SELECT });
      const data = await getJson(fetchImpl, "Crossref", `${CROSSREF_API}?${params}`, signal);
      const items = (data?.message?.items ?? []) as CrossrefWork[];
      const titles = new Set<string>();
      const hits: SourceHit[] = [];
      for (const work of items) {
        const doi = work.DOI?.toLowerCase();
        const title = titleOf(work);
        const key = title.toLowerCase().replace(/\W+/g, " ").trim();
        if (!doi || !DOI.test(doi) || titles.has(key)) continue;
        titles.add(key);
        found.set(doi, work);
        const year = yearOf(work);
        const abstract = abstractText(work.abstract);
        hits.push({ id: chemrxivDocId(doi), title: year ? `${title} (${year})` : title, snippet: abstract ? snippetOf(abstract.replace(/\n/g, " ")) : "No abstract." });
        if (hits.length === HITS) break;
      }
      return hits;
    },
    async fetch(id, signal) {
      const doi = id.slice(PREFIX.length).toLowerCase();
      if (!DOI.test(doi)) throw new SourceError(`"${id}" is not a ChemRxiv DOI.`);
      const work = await workFor(doi, signal);
      const doc: FetchedDocument = {
        id: chemrxivDocId(doi),
        title: titleOf(work),
        text: preprintText(work),
        url: `https://doi.org/${doi}`,
        retrievedAt: new Date().toISOString(),
        work: workInfo(work),
      };
      return doc;
    },
  };
}
