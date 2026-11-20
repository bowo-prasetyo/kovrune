// Scholarly works through the OpenAlex API, which allows cross-origin requests.
// Abstracts come as an inverted index (word -> positions) and are rebuilt here.
//
// Since harness 0.70.0 a search can be limited to works from a year on, to open-access works, and to a
// field of research, and prefers works with an abstract, which is all OpenAlex can be read as. A work
// that is on arXiv or in PubMed Central is read in full from there, when the user lets the agent use
// that source too: no other site is asked than those the user ticked.

import { arxivIdIn, titleKey } from "./arxiv.ts";
import { getJson, SourceError, type FetchedDocument, type FetchLike, type OpenSource, type RequestOptions, type WorkInfo } from "./types.ts";

const PREFIX = "openalex:";
export const OPENALEX_API = "https://api.openalex.org/works";
export const WORK_FIELDS = "id,display_name,publication_year,doi,authorships,abstract_inverted_index,primary_location,cited_by_count,referenced_works_count,is_retracted";
/** What reading a work also needs: where else it is, to read it in full there. */
export const READ_FIELDS = `${WORK_FIELDS},ids,locations`;
/** Works asked for in a search; the best `SEARCH_RESULTS` of them are shown. */
export const SEARCH_CANDIDATES = 25;
export const SEARCH_RESULTS = 5;

/**
 * OpenAlex's fields of research (its topics' second level, from Scopus's classification), as the user
 * picks them for a search, by their OpenAlex ID. The ones an engineering or physical-sciences researcher
 * is most likely to want, and since harness 0.101.0 the social sciences' (docs/social-sciences-audit.md,
 * S5); OpenAlex has 26.
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
  ["fields/33", "Social Sciences"],
  ["fields/32", "Psychology"],
  ["fields/20", "Economics, Econometrics and Finance"],
  ["fields/14", "Business, Management and Accounting"],
  ["fields/18", "Decision Sciences"],
  ["fields/12", "Arts and Humanities"],
];

/**
 * Computer science venues a search can be limited to, as OpenAlex holds them: the ACL Anthology (NLP:
 * ACL, EMNLP, NAACL, EACL, Findings, workshops) by its DOI prefix, and NeurIPS by its OpenAlex source,
 * kept on any of a work's locations so a NeurIPS paper merged with its arXiv preprint counts. A browser
 * can't read the ACL Anthology or OpenReview itself (neither allows requests from web pages), so their
 * papers are found here and read in full from arXiv when they are there (fullTextIds, findArxiv).
 * ICLR, ICML, JMLR and USENIX Security are not offered: OpenAlex holds 0 to 4 of their 2023 papers each
 * (eval/cs/README.md). Their papers are nearly all on arXiv, which the arXiv source searches.
 */
export const OPENALEX_VENUES: Array<[id: string, name: string, filter: string]> = [
  ["acl", "ACL Anthology (NLP)", "doi_starts_with:10.18653"],
  ["neurips", "NeurIPS", "locations.source.id:S4363606243"],
];

/** Limits on an OpenAlex search, as the user sets them under Search in. */
export interface OpenAlexFilters {
  /** Only works published in this year or later. */
  fromYear?: number;
  /** Only works OpenAlex knows a free copy of. */
  openAccess?: boolean;
  /** Only works whose main topic is in this field (OPENALEX_FIELDS). */
  field?: string;
  /** Only works from this computer science venue (OPENALEX_VENUES). */
  venue?: string;
}

/** OpenAlex's `filter` parameter for these limits, or undefined for none. */
export function openAlexFilter({ fromYear, openAccess, field, venue }: OpenAlexFilters): string | undefined {
  const parts = [
    ...(fromYear && Number.isInteger(fromYear) && fromYear > 1000 && fromYear < 3000 ? [`from_publication_date:${fromYear}-01-01`] : []),
    ...(openAccess ? ["is_oa:true"] : []),
    ...(field && OPENALEX_FIELDS.some(([id]) => id === field) ? [`primary_topic.field.id:${field}`] : []),
    ...OPENALEX_VENUES.filter(([id]) => id === venue).map(([, , filter]) => filter),
  ];
  return parts.length ? parts.join(",") : undefined;
}

/** Other sources a work can be read in full from, when the user ticked them. */
export interface FullTextReaders {
  /** The arXiv source: reads "arxiv:<id>". */
  arxiv?: OpenSource;
  /** The Europe PMC source: reads "europepmc:MED/<pmid>" or "europepmc:PMC/<pmcid>". */
  europepmc?: OpenSource;
  /** With the DataCite source, a Zenodo record's PDF: reads "zenodo:<record ID>" (datacite.ts createZenodoReader). */
  zenodo?: OpenSource;
  /**
   * With the arXiv source: the arXiv ID of a paper by its exact title (findArxivByTitle), for a work
   * whose OpenAlex record has no arXiv link, as a conference paper kept apart from its preprint has not.
   */
  findArxiv?: (title: string, signal?: AbortSignal) => Promise<string | undefined>;
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
  /** Works OpenAlex knows that cite this one. */
  cited_by_count?: number;
  /** Works in this one's reference list that OpenAlex knows. */
  referenced_works_count?: number;
  /** OpenAlex marks the work as retracted (harness 0.101.0). */
  is_retracted?: boolean;
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

/**
 * A warning put first in the text of a work OpenAlex marks as retracted (harness 0.101.0), as Europe PMC's
 * are (europepmc.ts RETRACTED_NOTE). OpenAlex marks 9,680 works in the Social Sciences, Psychology and
 * Economics so, among them LaCour and Green's "When contact changes minds", which searches showed as an
 * ordinary paper cited 137 times (docs/social-sciences-audit.md, S6).
 */
export const OPENALEX_RETRACTED_NOTE = "Note: OpenAlex marks this work as retracted. Its findings should not be relied on.";

/** A citable text for a work: a retraction's note, its details, then the abstract if OpenAlex has one. */
export function workText(work: Work): string {
  const authors = (work.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean);
  const lines = [
    work.is_retracted ? OPENALEX_RETRACTED_NOTE : "",
    work.display_name ?? "Untitled",
    [authors.slice(0, 5).join(", ") + (authors.length > 5 ? " et al." : ""), work.publication_year, work.primary_location?.source?.display_name]
      .filter(Boolean)
      .join(". "),
    work.doi ? `DOI: ${work.doi.replace(/^https:\/\/doi\.org\//, "")}` : "",
    citationCounts(work),
  ];
  const abstract = rebuildAbstract(work.abstract_inverted_index);
  lines.push(abstract ? `Abstract: ${abstract}` : "OpenAlex has no abstract for this work.");
  return lines.filter(Boolean).join("\n");
}

/**
 * A PubMed Central ID from OpenAlex's ids.pmcid. OpenAlex gives the article's URL with the bare number
 * ("https://www.ncbi.nlm.nih.gov/pmc/articles/8862100": all 200 in a sample), while Europe PMC and
 * citations use "PMC8862100", so both forms are read.
 */
export function pmcidOf(value: string | null | undefined): string | undefined {
  const match = value?.match(/PMC(\d+)/i) ?? value?.match(/\/pmc\/articles\/(\d+)\/?$/i);
  return match ? `PMC${match[1]}` : undefined;
}

/** "Cited by 1,088 works in OpenAlex; its references there: 32.", or "" when OpenAlex gives neither count. */
export function citationCounts(work: Work): string {
  const parts = [
    ...(typeof work.cited_by_count === "number" ? [`Cited by ${work.cited_by_count.toLocaleString("en")} works in OpenAlex`] : []),
    ...(work.referenced_works_count ? [`its references there: ${work.referenced_works_count}`] : []),
  ];
  return parts.length ? `${parts.join("; ")}.` : "";
}

/**
 * A search that follows citations (harness 0.84.0): "references of W123: words" lists the works W123
 * cites, "citing W123: words" the works that cite it, best matching the words first, or, without words,
 * most cited first. The work can be named by its OpenAlex ID, its DOI ("doi:10.18653/v1/2023.acl-long.1")
 * or its arXiv ID ("arxiv:2005.11401"), so a paper read from arXiv or Europe PMC can be followed too.
 * OpenAlex's own filter names are read as well ("cites:W123", "cited_by:W123"), since a model may know them.
 */
export interface CitationQuery {
  direction: "references" | "citing";
  /** "W123", "doi:…", "arxiv:…" or "title:…". */
  work: string;
  terms: string;
  /** For a title followed by a colon: the whole text, tried first as a title with a subtitle ("Lost in the Middle: How …"). */
  whole?: string;
}

const WORK_REF = String.raw`(?:openalex:)?(W\d+)|(?:doi:|https?://doi\.org/)?(10\.\d{4,9}/\S+)|arxiv:(\S+)`;
const CITATION_QUERY = new RegExp(
  String.raw`^\s*(references\s+of|reference\s+list\s+of|works\s+cited\s+by|cited_by:|citing|works\s+citing|papers\s+citing|citations\s+of|cites:)\s*(?:${WORK_REF})\s*[:,]?\s*([\s\S]*)$`,
  "i",
);

/**
 * The same forms with the paper named by its title, as a small model names it: "citing Lost in the Middle:
 * graph". Qwen3.5-4B, shown the forms with an ID, wrote "citing GRAG: Graph Retrieval-Augmented
 * Generation summarization" (eval/cs/README.md). The title runs to the first colon; without one, the whole
 * rest is the title.
 */
const CITATION_BY_TITLE = /^\s*(references\s+of|reference\s+list\s+of|works\s+cited\s+by|citing|works\s+citing|papers\s+citing|citations\s+of)\s+["'“]?([^:"”]{4,}?)["'”]?\s*(?::\s*([\s\S]*))?$/i;

/** Words copied from the usage line's own placeholder ("citing W123: words") are no words. */
function withoutPlaceholder(terms: string): string {
  return /^(?:<?\s*(?:words?|terms?|keywords?|\.\.\.|…)\s*>?)$/i.test(terms) ? "" : terms;
}

export function citationQuery(query: string): CitationQuery | undefined {
  const m = CITATION_QUERY.exec(query);
  if (!m) {
    const t = CITATION_BY_TITLE.exec(query);
    if (!t) return undefined;
    const title = t[2]!.trim();
    const terms = withoutPlaceholder((t[3] ?? "").trim());
    // "citing RAG" is a topic: without a colon after it, a title has at least two words. With one, a
    // paper's short name will do ("references of Self-RAG: PPO").
    if (terms === "" && t[3] === undefined && title.split(/\s+/).length < 2) return undefined;
    return {
      direction: /^(references|reference|works\s+cited)/i.test(t[1]!) ? "references" : "citing",
      work: `title:${title}`,
      terms,
      ...(terms ? { whole: `${title}: ${terms}` } : {}),
    };
  }
  const direction = /^(references|reference|works\s+cited|cited_by)/i.test(m[1]!) ? "references" : "citing";
  // A DOI or arXiv ID runs to the next space; a colon or comma after it introduces the words.
  const work = m[2] ? m[2].toUpperCase() : m[3] ? `doi:${m[3].replace(/[.,;:]+$/, "")}` : `arxiv:${m[4]!.replace(/[.,;:]+$/, "").replace(/v\d+$/, "")}`;
  return { direction, work, terms: withoutPlaceholder(m[5]!.replace(/^["']|["']$/g, "").trim()) };
}

/** The pointer after a scholarly work's first read, when OpenAlex is searched: how to follow its citations. */
export function citationNote(work: string): string {
  return `\n\n[To follow its citations, search_openalex "citing ${work}" for works citing it, or "references of ${work}" for works it cites; add a colon and a topic to narrow them.]`;
}

/** A citation note at the end of a read (citationNote), which shortening an old read leaves out. */
export const CITATION_NOTE_LINE = /\n*\[To follow its citations, [^\n]*\]/;

/** A work's reference details. */
export function workInfo(work: Work): WorkInfo {
  return {
    authors: (work.authorships ?? []).map((a) => a.author?.display_name).filter((name): name is string => Boolean(name)),
    ...(work.publication_year ? { year: work.publication_year } : {}),
    ...(work.doi ? { doi: work.doi.replace(/^https:\/\/doi\.org\//, "") } : {}),
    ...(work.primary_location?.source?.display_name ? { venue: work.primary_location.source.display_name } : {}),
    // OpenAlex gives these as URLs ("https://pubmed.ncbi.nlm.nih.gov/38012345"); the identifiers alone are cited.
    ...(work.ids?.pmid?.match(/\d+$/) ? { pmid: work.ids.pmid.match(/\d+$/)![0] } : {}),
    ...(pmcidOf(work.ids?.pmcid) ? { pmcid: pmcidOf(work.ids?.pmcid)! } : {}),
  };
}

/** A Zenodo record's ID in a URL or DOI: "zenodo.org/records/7654973", "zenodo.org/record/7976342", "10.5281/zenodo.7716415". */
const ZENODO_RECORD = /(?:zenodo\.org\/records?\/|10\.5281\/zenodo\.)(\d+)/i;

/** The Zenodo record a URL or DOI names, if any. */
export function zenodoRecordIn(text: string): string | undefined {
  return ZENODO_RECORD.exec(text)?.[1];
}

/**
 * Where a work can be read in full by a source the user ticked: its ID there. arXiv first, since its PDF
 * is the paper as the authors wrote it; then Europe PMC for a work in PubMed Central, by its PubMed ID
 * where it has one, as Europe PMC files most records; then, since harness 0.101.0, a copy on Zenodo, with
 * DataCite ticked. A record's own link ("zenodo.org/records/…") comes before a DOI, which may name the
 * concept of all its versions.
 */
export function fullTextIds(work: Work, readers: FullTextReaders): Array<{ reader: OpenSource; id: string }> {
  const ids: Array<{ reader: OpenSource; id: string }> = [];
  const arxiv = [work.doi ?? "", ...(work.locations ?? []).flatMap((l) => [l?.landing_page_url ?? "", l?.pdf_url ?? ""])].map(arxivIdIn).find(Boolean);
  if (readers.arxiv && arxiv) ids.push({ reader: readers.arxiv, id: `arxiv:${arxiv}` });
  const pmcid = pmcidOf(work.ids?.pmcid);
  const pmid = work.ids?.pmid?.match(/\d+$/)?.[0];
  if (readers.europepmc && pmcid) ids.push({ reader: readers.europepmc, id: pmid ? `europepmc:MED/${pmid}` : `europepmc:PMC/${pmcid}` });
  if (readers.zenodo) {
    const places = (work.locations ?? []).flatMap((l) => [l?.landing_page_url ?? "", l?.pdf_url ?? ""]);
    const record = [...places.filter((url) => /zenodo\.org\/records?\//i.test(url)), ...places, work.doi ?? ""].map(zenodoRecordIn).find(Boolean);
    if (record) ids.push({ reader: readers.zenodo, id: `zenodo:${record}` });
  }
  return ids;
}

/**
 * OpenAlex; with `apiKey`, requests use the user's own daily budget (openAlexOptions). A search asks for
 * SEARCH_CANDIDATES works within `filters` and shows SEARCH_RESULTS, those with an abstract first, in
 * OpenAlex's order: a work without one gives the model nothing to read or quote. A work is read in full
 * from arXiv or Europe PMC when `readers` has that source and the work is there (fullTextIds); otherwise,
 * or when that fails, as its abstract.
 */
export function createOpenAlex(
  fetchImpl: FetchLike = fetch,
  apiKey?: string,
  filters: OpenAlexFilters = {},
  readers: FullTextReaders = {},
  /**
   * Tell the model it can follow citations (followsCitations). Off by default: told so, Qwen3.5-4B passed
   * 2 and 3 of 5 citation questions where it passed 4 without, mostly following the wrong paper's citations
   * (eval/cs/README.md). The search forms work either way.
   */
  behaviour: { followCitations?: boolean } = {},
): OpenSource {
  const { params: auth, options } = openAlexOptions(apiKey);
  const filter = openAlexFilter(filters);
  return {
    name: "openalex",
    ...(behaviour.followCitations ? { followsCitations: true } : {}),
    label: "OpenAlex",
    async search(query, signal) {
      let cited = citationQuery(query);
      // A title with a subtitle is tried whole first; failing that, the part before the colon, with the rest as words.
      const whole = cited?.whole ? await workByTitle(fetchImpl, cited.whole, auth, options, signal) : undefined;
      if (cited && whole) cited = { ...cited, terms: "" };
      const id = whole ?? (cited ? await openAlexId(fetchImpl, cited.work, auth, options, signal) : undefined);
      // A title that names no work is a topic after all: it is searched as words.
      if (cited && !id && cited.work.startsWith("title:")) cited = undefined;
      if (cited && !id) throw new SourceError(`OpenAlex has no work ${cited.work.replace(/^doi:/, "with DOI ").replace(/^arxiv:/, "for arXiv paper ").replace(/^title:(.*)$/, 'titled "$1"')}.`);
      const follow = cited && id ? `${cited.direction === "references" ? "cited_by" : "cites"}:${id}` : undefined;
      const terms = cited ? cited.terms : query;
      const params = new URLSearchParams({
        ...(terms ? { search: terms } : { sort: "cited_by_count:desc" }),
        "per-page": String(SEARCH_CANDIDATES),
        select: WORK_FIELDS,
        ...(filter || follow ? { filter: [follow, filter].filter(Boolean).join(",") } : {}),
        ...auth,
      });
      const data = await getJson(fetchImpl, "OpenAlex", `${OPENALEX_API}?${params}`, signal, options);
      const works: Work[] = data?.results ?? [];
      const withAbstract = (work: Work) => Boolean(work.abstract_inverted_index && Object.keys(work.abstract_inverted_index).length);
      return [...works.filter(withAbstract), ...works.filter((work) => !withAbstract(work))].slice(0, SEARCH_RESULTS).map((work) => {
        const abstract = rebuildAbstract(work.abstract_inverted_index);
        const about = [
          ...(work.is_retracted ? ["RETRACTED"] : []),
          ...(work.publication_year ? [String(work.publication_year)] : []),
          ...(cited && typeof work.cited_by_count === "number" ? [`cited by ${work.cited_by_count.toLocaleString("en")}`] : []),
        ];
        return {
          id: workId(work),
          title: `${work.display_name ?? "Untitled"}${about.length ? ` (${about.join(", ")})` : ""}`,
          snippet: abstract ? snippetOf(abstract) : "No abstract.",
        };
      });
    },
    async fetch(id, signal) {
      const key = id.slice(PREFIX.length);
      if (!/^W\d+$/.test(key)) throw new SourceError(`"${id}" is not an OpenAlex work ID.`);
      const work: Work = await getJson(fetchImpl, "OpenAlex", `${OPENALEX_API}/${key}?${new URLSearchParams({ select: READ_FIELDS, ...auth })}`, signal, options);
      const elsewhere = fullTextIds(work, readers);
      if (readers.arxiv && readers.findArxiv && work.display_name && !elsewhere.some(({ id }) => id.startsWith("arxiv:"))) {
        try {
          const found = await readers.findArxiv(work.display_name, signal);
          if (found) elsewhere.unshift({ reader: readers.arxiv, id: `arxiv:${found}` });
        } catch (error) {
          if (signal?.aborted) throw error;
          // Not found on arXiv: read it as its abstract, or from the next source.
        }
      }
      for (const { reader, id: there } of elsewhere) {
        try {
          return fullTextDocument(work, await reader.fetch(there, signal), reader.label);
        } catch (error) {
          if (signal?.aborted) throw error;
          // Read it as its abstract, or from the next source.
        }
      }
      const pdf = openPdf(work);
      return {
        id: workId(work),
        title: work.display_name ?? "Untitled",
        text: workText(work) + (pdf ? `\nFull text (not read here; a web page cannot download it): ${pdf}. The user can download it and add it to their documents.` : ""),
        url: work.doi ?? `https://openalex.org/${key}`,
        retrievedAt: new Date().toISOString(),
        work: workInfo(work),
      };
    },
  };
}

/**
 * The OpenAlex ID of a work named in a citation search: as given, or looked up by its DOI or arXiv ID
 * (OpenAlex registers arXiv papers under arXiv's DOI, 10.48550/arXiv.<id>). Undefined when OpenAlex has
 * no such work.
 */
async function openAlexId(fetchImpl: FetchLike, work: string, auth: Record<string, string>, options: RequestOptions, signal?: AbortSignal): Promise<string | undefined> {
  if (/^W\d+$/.test(work)) return work;
  if (work.startsWith("title:")) return workByTitle(fetchImpl, work.slice(6), auth, options, signal);
  const doi = work.startsWith("arxiv:") ? `10.48550/arXiv.${work.slice(6)}` : work.slice(4);
  try {
    const found: Work = await getJson(fetchImpl, "OpenAlex", `${OPENALEX_API}/doi:${encodeURIComponent(doi)}?${new URLSearchParams({ select: "id", ...auth })}`, signal, options);
    return found?.id?.replace(/^https:\/\/openalex\.org\//, "");
  } catch (error) {
    if (error instanceof SourceError && /HTTP 404/.test(error.message)) return undefined;
    throw error;
  }
}

/**
 * The OpenAlex ID of the work a title names: of the works whose title has its words, the best match whose
 * title starts with the one given, or is the start of it ("Self-RAG" names "Self-RAG: Learning to
 * Retrieve…"). Undefined when none does, so a topic ("retrieval augmented generation") is searched as words
 * rather than followed as some paper's citations.
 */
async function workByTitle(fetchImpl: FetchLike, title: string, auth: Record<string, string>, options: RequestOptions, signal?: AbortSignal): Promise<string | undefined> {
  const words = title.replace(/[,:|"()]/g, " ").replace(/\s+/g, " ").trim();
  const key = titleKey(title);
  if (!words || key.length < 4) return undefined;
  const params = new URLSearchParams({ search: words, filter: `title.search:${words}`, "per-page": "10", select: "id,display_name", ...auth });
  const found: Work[] = (await getJson(fetchImpl, "OpenAlex", `${OPENALEX_API}?${params}`, signal, options))?.results ?? [];
  const match = found.find((w) => {
    const other = titleKey(w.display_name ?? "");
    return other.length > 0 && (other.startsWith(key) || key.startsWith(other));
  });
  return match?.id.replace(/^https:\/\/openalex\.org\//, "");
}

/**
 * A free PDF of a work that no ticked source reads, for the user to add to their documents: an ACL
 * Anthology paper not on arXiv, for one (aclanthology.org/2023.eacl-main.252.pdf). None for an arXiv or
 * PubMed Central copy, which their sources read.
 */
export function openPdf(work: Work): string | undefined {
  return (work.locations ?? []).map((l) => l?.pdf_url ?? "").find((url) => /^https:\/\//.test(url) && !arxivIdIn(url) && !/ncbi\.nlm\.nih\.gov|europepmc\.org/.test(url));
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
    // A paper found on arXiv by its title has no DataCite record behind it, so its authors and year come from OpenAlex.
    ...(read.work ? { work: read.work.authors.length ? read.work : { ...workInfo(work), doi: read.work.doi, venue: read.work.venue } } : { work: workInfo(work) }),
    ...(read.pageStarts ? { pageStarts: read.pageStarts.map((start) => start + head.length) } : {}),
  };
}

/**
 * A work's title and reference details by its DOI, for a document of the user's that prints one and
 * came with no reference export (src/app/research/import.ts). Only the DOI is sent. Undefined when
 * OpenAlex does not know the DOI.
 */
export async function workByDoi(
  doi: string,
  fetchImpl: FetchLike = fetch,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<{ title?: string; info: WorkInfo } | undefined> {
  const { params: auth, options } = openAlexOptions(apiKey);
  const params = new URLSearchParams({ select: "id,display_name,publication_year,doi,authorships,primary_location,ids", ...auth });
  try {
    const work: Work = await getJson(fetchImpl, "OpenAlex", `${OPENALEX_API}/doi:${encodeURIComponent(doi)}?${params}`, signal, options);
    return { ...(work.display_name ? { title: work.display_name } : {}), info: workInfo(work) };
  } catch (error) {
    if (error instanceof SourceError && /\b404\b|not found/i.test(error.message)) return undefined;
    throw error;
  }
}
