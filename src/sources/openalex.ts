// Scholarly works through the OpenAlex API, which allows cross-origin requests.
// Abstracts come as an inverted index (word -> positions) and are rebuilt here.
//
// Since harness 0.70.0 a search can be limited to works from a year on, to open-access works, and to a
// field of research, and prefers works with an abstract, which is all OpenAlex can be read as. A work
// that is on arXiv or in PubMed Central is read in full from there, when the user lets the agent use
// that source too: no other site is asked than those the user ticked.

import { arxivIdIn } from "./arxiv.ts";
import { getJson, SourceError, type FetchedDocument, type FetchLike, type OpenSource, type RequestOptions, type WorkInfo } from "./types.ts";

const PREFIX = "openalex:";
export const OPENALEX_API = "https://api.openalex.org/works";
export const WORK_FIELDS = "id,display_name,publication_year,doi,authorships,abstract_inverted_index,primary_location";
/** What reading a work also needs: where else it is, to read it in full there. */
export const READ_FIELDS = `${WORK_FIELDS},ids,locations`;
/** Works asked for in a search; the best `SEARCH_RESULTS` of them are shown. */
export const SEARCH_CANDIDATES = 25;
export const SEARCH_RESULTS = 5;

/**
 * OpenAlex's fields of research (its topics' second level, from Scopus's classification), as the user
 * picks them for a search, by their OpenAlex ID. The ones an engineering or physical-sciences researcher
 * is most likely to want; OpenAlex has 26.
 */
export const OPENALEX_FIELDS: Array<[id: string, name: string]> = [
  ["fields/22", "Engineering"],
  ["fields/17", "Computer Science"],
  ["fields/25", "Materials Science"],
  ["fields/21", "Energy"],
  ["fields/31", "Physics and Astronomy"],
  ["fields/15", "Chemical Engineering"],
  ["fields/16", "Chemistry"],
  ["fields/26", "Mathematics"],
  ["fields/19", "Earth and Planetary Sciences"],
  ["fields/23", "Environmental Science"],
  ["fields/27", "Medicine"],
];

/** Limits on an OpenAlex search, as the user sets them under Search in. */
export interface OpenAlexFilters {
  /** Only works published in this year or later. */
  fromYear?: number;
  /** Only works OpenAlex knows a free copy of. */
  openAccess?: boolean;
  /** Only works whose main topic is in this field (OPENALEX_FIELDS). */
  field?: string;
}

/** OpenAlex's `filter` parameter for these limits, or undefined for none. */
export function openAlexFilter({ fromYear, openAccess, field }: OpenAlexFilters): string | undefined {
  const parts = [
    ...(fromYear && Number.isInteger(fromYear) && fromYear > 1000 && fromYear < 3000 ? [`from_publication_date:${fromYear}-01-01`] : []),
    ...(openAccess ? ["is_oa:true"] : []),
    ...(field && OPENALEX_FIELDS.some(([id]) => id === field) ? [`primary_topic.field.id:${field}`] : []),
  ];
  return parts.length ? parts.join(",") : undefined;
}

/** Other sources a work can be read in full from, when the user ticked them. */
export interface FullTextReaders {
  /** The arXiv source: reads "arxiv:<id>". */
  arxiv?: OpenSource;
  /** The Europe PMC source: reads "europepmc:MED/<pmid>" or "europepmc:PMC/<pmcid>". */
  europepmc?: OpenSource;
}

/**
 * Said when OpenAlex's daily budget is used up. Since 2026, requests without an API key share a
 * small daily budget with everyone on the same IP address; a free key has its own.
 */
export const OPENALEX_KEY_HINT = "A free OpenAlex API key, added under Search in, gives you your own daily budget.";

/** OpenAlex's request options: its own budget with a key, and the hint without one. */
export function openAlexOptions(apiKey?: string): { params: Record<string, string>; options: RequestOptions } {
  const key = apiKey?.trim();
  return key ? { params: { api_key: key }, options: {} } : { params: {}, options: { limitHint: OPENALEX_KEY_HINT } };
}

export interface Work {
  id: string;
  ids?: { pmid?: string | null; pmcid?: string | null } | null;
  locations?: Array<{ landing_page_url?: string | null; pdf_url?: string | null } | null> | null;
  display_name?: string;
  publication_year?: number;
  doi?: string | null;
  authorships?: Array<{ author?: { display_name?: string } }>;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: { source?: { display_name?: string } | null } | null;
}

export function rebuildAbstract(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const at of positions) words[at] = word;
  return words.filter((w) => w !== undefined).join(" ");
}

/**
 * The start of an abstract for search results, ending at a sentence end so a quote taken
 * from it is complete text. A snippet cut mid-word ("…can sometimes match hum…") led a small
 * model to invent the rest of the sentence. Falls back to whole words when the first sentence
 * is very long.
 */
export function snippetOf(abstract: string, max = 320): string {
  if (abstract.length <= max) return abstract;
  const head = abstract.slice(0, max);
  const sentenceEnd = Math.max(...[". ", "? ", "! "].map((mark) => head.lastIndexOf(mark)));
  if (sentenceEnd > 0) return `${head.slice(0, sentenceEnd + 1)} […]`;
  return `${head.slice(0, head.lastIndexOf(" "))} […]`;
}

function workId(work: Work): string {
  return PREFIX + work.id.replace(/^https:\/\/openalex\.org\//, "");
}

/** A citable text for a work: its details, then the abstract if OpenAlex has one. */
export function workText(work: Work): string {
  const authors = (work.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean);
  const lines = [
    work.display_name ?? "Untitled",
    [authors.slice(0, 5).join(", ") + (authors.length > 5 ? " et al." : ""), work.publication_year, work.primary_location?.source?.display_name]
      .filter(Boolean)
      .join(". "),
    work.doi ? `DOI: ${work.doi.replace(/^https:\/\/doi\.org\//, "")}` : "",
  ];
  const abstract = rebuildAbstract(work.abstract_inverted_index);
  lines.push(abstract ? `Abstract: ${abstract}` : "OpenAlex has no abstract for this work.");
  return lines.filter(Boolean).join("\n");
}

/** A work's reference details. */
export function workInfo(work: Work): WorkInfo {
  return {
    authors: (work.authorships ?? []).map((a) => a.author?.display_name).filter((name): name is string => Boolean(name)),
    ...(work.publication_year ? { year: work.publication_year } : {}),
    ...(work.doi ? { doi: work.doi.replace(/^https:\/\/doi\.org\//, "") } : {}),
    ...(work.primary_location?.source?.display_name ? { venue: work.primary_location.source.display_name } : {}),
  };
}

/**
 * Where a work can be read in full by a source the user ticked: its ID there. arXiv first, since its PDF
 * is the paper as the authors wrote it; then Europe PMC for a work in PubMed Central, by its PubMed ID
 * where it has one, as Europe PMC files most records.
 */
export function fullTextIds(work: Work, readers: FullTextReaders): Array<{ reader: OpenSource; id: string }> {
  const ids: Array<{ reader: OpenSource; id: string }> = [];
  const arxiv = [work.doi ?? "", ...(work.locations ?? []).flatMap((l) => [l?.landing_page_url ?? "", l?.pdf_url ?? ""])].map(arxivIdIn).find(Boolean);
  if (readers.arxiv && arxiv) ids.push({ reader: readers.arxiv, id: `arxiv:${arxiv}` });
  const pmcid = work.ids?.pmcid?.match(/PMC\d+/)?.[0];
  const pmid = work.ids?.pmid?.match(/\d+$/)?.[0];
  if (readers.europepmc && pmcid) ids.push({ reader: readers.europepmc, id: pmid ? `europepmc:MED/${pmid}` : `europepmc:PMC/${pmcid}` });
  return ids;
}

/**
 * OpenAlex; with `apiKey`, requests use the user's own daily budget (openAlexOptions). A search asks for
 * SEARCH_CANDIDATES works within `filters` and shows SEARCH_RESULTS, those with an abstract first, in
 * OpenAlex's order: a work without one gives the model nothing to read or quote. A work is read in full
 * from arXiv or Europe PMC when `readers` has that source and the work is there (fullTextIds); otherwise,
 * or when that fails, as its abstract.
 */
export function createOpenAlex(fetchImpl: FetchLike = fetch, apiKey?: string, filters: OpenAlexFilters = {}, readers: FullTextReaders = {}): OpenSource {
  const { params: auth, options } = openAlexOptions(apiKey);
  const filter = openAlexFilter(filters);
  return {
    name: "openalex",
    label: "OpenAlex",
    async search(query, signal) {
      const params = new URLSearchParams({ search: query, "per-page": String(SEARCH_CANDIDATES), select: WORK_FIELDS, ...(filter ? { filter } : {}), ...auth });
      const data = await getJson(fetchImpl, "OpenAlex", `${OPENALEX_API}?${params}`, signal, options);
      const works: Work[] = data?.results ?? [];
      const withAbstract = (work: Work) => Boolean(work.abstract_inverted_index && Object.keys(work.abstract_inverted_index).length);
      return [...works.filter(withAbstract), ...works.filter((work) => !withAbstract(work))].slice(0, SEARCH_RESULTS).map((work) => {
        const abstract = rebuildAbstract(work.abstract_inverted_index);
        const year = work.publication_year ? ` (${work.publication_year})` : "";
        return {
          id: workId(work),
          title: `${work.display_name ?? "Untitled"}${year}`,
          snippet: abstract ? snippetOf(abstract) : "No abstract.",
        };
      });
    },
    async fetch(id, signal) {
      const key = id.slice(PREFIX.length);
      if (!/^W\d+$/.test(key)) throw new SourceError(`"${id}" is not an OpenAlex work ID.`);
      const work: Work = await getJson(fetchImpl, "OpenAlex", `${OPENALEX_API}/${key}?${new URLSearchParams({ select: READ_FIELDS, ...auth })}`, signal, options);
      for (const { reader, id: there } of fullTextIds(work, readers)) {
        try {
          return fullTextDocument(work, await reader.fetch(there, signal), reader.label);
        } catch (error) {
          if (signal?.aborted) throw error;
          // Read it as its abstract, or from the next source.
        }
      }
      return {
        id: workId(work),
        title: work.display_name ?? "Untitled",
        text: workText(work),
        url: work.doi ?? `https://openalex.org/${key}`,
        retrievedAt: new Date().toISOString(),
        work: workInfo(work),
      };
    },
  };
}

/**
 * A work read in full from another source: under its OpenAlex ID, so the agent's citation is the work it
 * opened, with OpenAlex's details first and then the full text. The reference is the version read, as
 * the other source gives it (an arXiv paper is cited as arXiv's), and the page starts are moved past the
 * details.
 */
function fullTextDocument(work: Work, read: FetchedDocument, label: string): FetchedDocument {
  const head = `${workText({ ...work, abstract_inverted_index: null }).replace(/\nOpenAlex has no abstract for this work\.$/, "")}\nFull text, read from ${label}:\n\n`;
  return {
    id: workId(work),
    title: work.display_name ?? read.title,
    text: head + read.text,
    url: read.url,
    retrievedAt: read.retrievedAt,
    ...(read.work ? { work: read.work } : { work: workInfo(work) }),
    ...(read.pageStarts ? { pageStarts: read.pageStarts.map((start) => start + head.length) } : {}),
  };
}
