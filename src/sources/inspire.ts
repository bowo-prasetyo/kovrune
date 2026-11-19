// INSPIRE-HEP: the literature database of high-energy physics, run by CERN, DESY, Fermilab, IHEP and SLAC
// (harness 0.92.0). It holds the field's papers, preprints, conference contributions, theses and
// collaboration notes, with curated reference lists and citation counts, journal references and the TeX keys
// physicists cite by ("Aad:2012tfa"). Its API allows requests from web pages (Access-Control-Allow-Origin: *)
// and needs no key. NASA ADS, astronomy's counterpart, does not: it answers cross-origin requests only from
// its own site, so a web page can't use it (eval/field/README.md).
//
// INSPIRE holds records, not texts, so a record is read as its abstract, or in full from arXiv when the user
// ticked arXiv too and the paper is there, as OpenAlex works are (openalex.ts).

import { titleKey } from "./arxiv.ts";
import { citationQuery, snippetOf, type FullTextReaders } from "./openalex.ts";
import { getJson, SourceError, stripTags, type FetchedDocument, type FetchLike, type OpenSource, type WorkInfo } from "./types.ts";

const PREFIX = "inspire:";
export const INSPIRE_API = "https://inspirehep.net/api/literature";
/** What a search result needs. Not the authors: a collaboration's paper lists thousands (ATLAS's Higgs discovery, 2,932). */
export const SEARCH_FIELDS = "titles,abstracts,collaborations,arxiv_eprints,dois,publication_info,citation_count,control_number,earliest_date,document_type";
/**
 * What reading a record needs. Records are read through the search (q=recid:…), which honours `fields`; the
 * record's own URL ignores it and returns everything, 1.1 MB for the Higgs discovery paper against 110 kB.
 * `references.record` is only to count the references INSPIRE links.
 */
export const READ_FIELDS = `${SEARCH_FIELDS},authors.full_name,author_count,citation_count_without_self_citations,texkeys,report_numbers,references.record`;
export const SEARCH_RESULTS = 5;
/** Records asked for when titles and abstracts are searched, to fill the results after the title matches. */
const FILL_CANDIDATES = 10;

/** An INSPIRE literature record, as far as Kovrune reads it. */
export interface InspireRecord {
  control_number: number;
  titles?: Array<{ title?: string }>;
  abstracts?: Array<{ value?: string; source?: string }>;
  authors?: Array<{ full_name?: string }>;
  author_count?: number;
  collaborations?: Array<{ value?: string }>;
  arxiv_eprints?: Array<{ value?: string; categories?: string[] }>;
  dois?: Array<{ value?: string }>;
  publication_info?: Array<{ journal_title?: string; journal_volume?: string; year?: number; page_start?: string; page_end?: string; artid?: string; pubinfo_freetext?: string }>;
  citation_count?: number;
  citation_count_without_self_citations?: number;
  earliest_date?: string;
  document_type?: string[];
  texkeys?: string[];
  report_numbers?: Array<{ value?: string }>;
  references?: unknown[];
}

/** Words a query is searched by: the content words, without INSPIRE's operators and field names. */
const STOP = new Set(
  "a an the of for in on with to and or not by at from as is are was were be been what which who whom whose how why when where does do did its their this that these those it find measured using reported report paper papers".split(" "),
);

/**
 * The words of a query as INSPIRE's search takes them. INSPIRE reads "a …" as an author search, "t …" as a
 * title search, "and", "or" and "not" as operators, a leading "-" as "not", and ":", "/", quotes and
 * brackets as syntax, so a model's natural query ("a search for dark photons") found nothing. Each word
 * is kept as letters, digits and inner ".+-" ("g-2", "fb-1", "1.96"); single letters are kept ("W boson"),
 * except "a".
 */
export function inspireWords(query: string): string[] {
  const words: string[] = [];
  for (const token of query.match(/[\p{L}\p{N}][\p{L}\p{N}.+-]*/gu) ?? []) {
    const word = token.replace(/[.+-]+$/, "");
    if (!word || STOP.has(word.toLowerCase())) continue;
    words.push(word);
  }
  return words;
}

/**
 * The tries for a query's words: all of them, then without plain numbers, then the first three. INSPIRE's
 * search needs every word, so a long query often finds nothing: "muon anomalous magnetic moment measurement
 * Fermilab 0.20 ppm" did not, without "0.20" it did. Names with digits ("g-2", "GW170817") are kept.
 */
export function wordTries(words: string[]): string[][] {
  const tries = [words, words.filter((w) => !/^\p{N}+(?:[.,]\p{N}+)*$/u.test(w)), words.slice(0, 3)];
  const seen = new Set<string>();
  return tries.filter((t) => {
    const key = t.join(" ");
    if (!t.length || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A search that follows citations, as OpenAlex's (citationQuery): "citing inspire:1124337: words" lists the
 * records citing it, "references of inspire:1124337" those it cites, most cited first, narrowed by the words.
 * The paper can also be named by its arXiv ID, its DOI or its title. INSPIRE's own forms are read too
 * ("refersto:recid:1124337", "citedby:recid:1124337"), since a model may know them.
 */
export interface InspireCitationQuery {
  direction: "references" | "citing";
  /** "recid:123", "arxiv:…", "doi:…" or "title:…". */
  work: string;
  terms: string;
}

const OWN_FORM = /^\s*(refersto|citedby)\s*:\s*(?:recid\s*:\s*|inspire\s*:\s*)?(\d+)\s*(?:and\s+)?([\s\S]*)$/i;
const BY_RECORD = /^\s*(references\s+of|reference\s+list\s+of|works\s+cited\s+by|citing|works\s+citing|papers\s+citing|citations\s+of)\s*(?:inspire|recid)\s*:\s*(\d+)\s*[:,]?\s*([\s\S]*)$/i;

export function inspireCitationQuery(query: string): InspireCitationQuery | undefined {
  const own = OWN_FORM.exec(query);
  if (own) return { direction: own[1]!.toLowerCase() === "citedby" ? "references" : "citing", work: `recid:${own[2]}`, terms: own[3]!.trim() };
  const record = BY_RECORD.exec(query);
  if (record) return { direction: /^(references|reference|works\s+cited)/i.test(record[1]!) ? "references" : "citing", work: `recid:${record[2]}`, terms: record[3]!.trim() };
  const other = citationQuery(query);
  if (!other) return undefined;
  if (/^W\d+$/.test(other.work)) throw new SourceError(`${other.work} is an OpenAlex ID; INSPIRE names its records "inspire:<number>".`);
  return { direction: other.direction, work: other.work, terms: other.terms };
}

/** The pointer after a record's first read, when the model is told it can follow citations through INSPIRE. */
export function inspireCitationNote(work: string): string {
  return `\n\n[To follow its citations, search_inspire "citing ${work}" for records citing it, or "references of ${work}" for records it cites; add a colon and a topic to narrow them.]`;
}

export function inspireDocId(record: InspireRecord): string {
  return `${PREFIX}${record.control_number}`;
}

/**
 * A record's title as text. Titles from publishers can hold MathML ("Inert Higgs Dark Matter for CDF II
 * <math display="inline"><mi>W</mi></math>-Boson Mass"), read as the text inside it.
 */
function titleOf(record: InspireRecord): string {
  return stripTags(record.titles?.[0]?.title ?? "") || "Untitled";
}

function yearOf(record: InspireRecord): number | undefined {
  const year = Number(record.earliest_date?.slice(0, 4) ?? record.publication_info?.[0]?.year);
  return Number.isInteger(year) && year > 1000 ? year : undefined;
}

function collaborationOf(record: InspireRecord): string | undefined {
  const names = (record.collaborations ?? []).map((c) => c.value).filter(Boolean);
  return names.length ? `${names.join(", ")} Collaboration${names.length > 1 ? "s" : ""}` : undefined;
}

/**
 * The abstract a reader wants: the arXiv one, as the authors wrote it, before a publisher's. A publisher's
 * abstract can be JATS XML ("<jats:p>… <jats:italic>W</jats:italic> boson …", CDF's W mass in Science),
 * read as its text.
 */
function abstractOf(record: InspireRecord): string {
  const abstracts = record.abstracts ?? [];
  return stripTags((abstracts.find((a) => a.source === "arXiv") ?? abstracts[0])?.value ?? "");
}

function arxivOf(record: InspireRecord): string | undefined {
  return record.arxiv_eprints?.[0]?.value?.trim() || undefined;
}

/** A journal reference as physicists write it: "Phys.Lett.B 716 (2012) 1-29". */
export function journalRef(record: InspireRecord): string | undefined {
  const pub = record.publication_info?.find((p) => p.journal_title);
  if (!pub) return undefined;
  const pages = pub.page_start ? (pub.page_end ? `${pub.page_start}-${pub.page_end}` : pub.page_start) : pub.artid;
  return [pub.journal_title, pub.journal_volume, pub.year ? `(${pub.year})` : undefined, pages].filter(Boolean).join(" ");
}

/** "Cited by 17,837 records in INSPIRE (14,196 without self-citations); its references linked there: 139." */
export function inspireCounts(record: InspireRecord): string {
  const parts = [
    ...(typeof record.citation_count === "number"
      ? [
          `Cited by ${record.citation_count.toLocaleString("en")} records in INSPIRE` +
            (typeof record.citation_count_without_self_citations === "number" && record.citation_count_without_self_citations !== record.citation_count
              ? ` (${record.citation_count_without_self_citations.toLocaleString("en")} without self-citations)`
              : ""),
        ]
      : []),
    ...(record.references?.length ? [`its references linked there: ${record.references.length}`] : []),
  ];
  return parts.length ? `${parts.join("; ")}.` : "";
}

/** The authors as a citation names them: the first five, or the collaboration for a large author list. */
function authorLine(record: InspireRecord): string {
  const names = (record.authors ?? []).map((a) => a.full_name).filter(Boolean) as string[];
  const collaboration = collaborationOf(record);
  const count = record.author_count ?? names.length;
  if (collaboration && count > 10) return `${collaboration} (${count.toLocaleString("en")} authors)`;
  const shown = names.slice(0, 5).join("; ") + (count > 5 ? " et al." : "");
  return [shown, collaboration].filter(Boolean).join(", ");
}

/** A record as text: its details, then its abstract. */
export function recordText(record: InspireRecord): string {
  const lines = [
    titleOf(record),
    [authorLine(record), yearOf(record)].filter(Boolean).join(". "),
    journalRef(record) ? `Journal: ${journalRef(record)}` : "",
    record.dois?.[0]?.value ? `DOI: ${record.dois[0].value}` : "",
    arxivOf(record) ? `arXiv: ${arxivOf(record)}` : "",
    record.report_numbers?.length ? `Report numbers: ${record.report_numbers.map((r) => r.value).filter(Boolean).join(", ")}` : "",
    record.texkeys?.[0] ? `INSPIRE TeX key: ${record.texkeys[0]}` : "",
    inspireCounts(record),
  ];
  const abstract = abstractOf(record);
  lines.push(abstract ? `Abstract: ${abstract}` : "INSPIRE has no abstract for this record.");
  return lines.filter(Boolean).join("\n");
}

/** A record's reference details; a collaboration's paper is cited by its collaboration, as physicists do. */
export function inspireWorkInfo(record: InspireRecord): WorkInfo {
  const names = (record.authors ?? []).map((a) => a.full_name).filter(Boolean) as string[];
  const collaboration = collaborationOf(record);
  const year = yearOf(record);
  const doi = record.dois?.[0]?.value;
  const venue = record.publication_info?.find((p) => p.journal_title)?.journal_title;
  const texkey = record.texkeys?.[0];
  return {
    authors: collaboration && (record.author_count ?? names.length) > 10 ? [collaboration] : names.slice(0, 50),
    ...(year ? { year } : {}),
    ...(doi ? { doi } : {}),
    ...(venue ? { venue } : {}),
    ...(texkey ? { texkey } : {}),
  };
}

/** A search result's title: the record's, with its year, collaboration and citations. */
function hitTitle(record: InspireRecord): string {
  const about = [yearOf(record), collaborationOf(record), typeof record.citation_count === "number" ? `cited by ${record.citation_count.toLocaleString("en")}` : undefined]
    .filter(Boolean)
    .join(", ");
  return about ? `${titleOf(record)} (${about})` : titleOf(record);
}

/**
 * INSPIRE-HEP as an open source. A search finds records whose title has every word of the query, most cited
 * first, then fills the results with records whose title, abstract or author list has them. Most cited first: INSPIRE's
 * own relevance order put the Higgs discovery papers below the first 25 for "observation of a new boson
 * higgs 125 GeV", and its plain search reads the full text and references too, so "muon g-2" found the
 * Planck results first (eval/field/README.md). A record is read in full from arXiv when `readers` has the
 * arXiv source and the paper is on arXiv; otherwise, or when that fails, as its abstract.
 */
export function createInspire(fetchImpl: FetchLike = fetch, readers: Pick<FullTextReaders, "arxiv"> = {}, behaviour: { followCitations?: boolean } = {}): OpenSource {
  const records = async (q: string, size: number, fields: string, signal?: AbortSignal): Promise<InspireRecord[]> => {
    const params = new URLSearchParams({ q, size: String(size), sort: "mostcited", fields });
    const data = await getJson(fetchImpl, "INSPIRE", `${INSPIRE_API}?${params}`, signal);
    return (data?.hits?.hits ?? []).map((h: { metadata: InspireRecord }) => h.metadata).filter((r: InspireRecord) => r && typeof r.control_number === "number");
  };

  /** The record a citation search names: by its record number, arXiv ID, DOI or title. */
  async function recordId(work: string, signal?: AbortSignal): Promise<number | undefined> {
    if (work.startsWith("recid:")) return Number(work.slice(6));
    if (work.startsWith("title:")) {
      const title = work.slice(6);
      const words = inspireWords(title);
      const key = titleKey(title);
      if (!words.length || key.length < 4) return undefined;
      const found = await records(`title:(${words.join(" ")})`, 10, "titles,control_number", signal);
      return found.find((r) => {
        const other = titleKey(titleOf(r));
        return other.length > 0 && (other.startsWith(key) || key.startsWith(other));
      })?.control_number;
    }
    const q = work.startsWith("arxiv:") ? `arxiv:${work.slice(6)}` : `doi:"${work.slice(4).replace(/"/g, "")}"`;
    return (await records(q, 1, "control_number", signal))[0]?.control_number;
  }

  /**
   * Records matching words: by title first, then by title, abstract or author, most cited first. An author's
   * name counts so that "references of inspire:1124337: Higgs" finds Higgs's 1964 papers, whose titles and
   * abstracts do not name him. With no words, the records `within` names.
   */
  async function byWords(words: string[], within: string | undefined, signal?: AbortSignal): Promise<InspireRecord[]> {
    const referenceList = within?.startsWith("citedby:");
    const scope = (q: string) => (within ? `${within} and (${q})` : q);
    if (!words.length) return within ? records(within, SEARCH_RESULTS, SEARCH_FIELDS, signal) : [];
    const group = words.join(" ");
    // Within one paper's reference list, titles are not searched first: there are few records to rank, and a
    // question about them names an author as often as a topic. A well-cited paper's citing records are
    // thousands (17,837 for the Higgs discovery), and are ranked as a search is.
    const found = referenceList ? [] : await records(scope(`title:(${group})`), SEARCH_RESULTS, SEARCH_FIELDS, signal);
    if (found.length >= SEARCH_RESULTS) return found;
    const seen = new Set(found.map((r) => r.control_number));
    const more = await records(scope(`title:(${group}) or abstracts.value:(${group}) or authors.full_name:(${group})`), FILL_CANDIDATES, SEARCH_FIELDS, signal);
    return [...found, ...more.filter((r) => !seen.has(r.control_number))].slice(0, SEARCH_RESULTS);
  }

  return {
    name: "inspire",
    ...(behaviour.followCitations ? { followsCitations: true } : {}),
    label: "INSPIRE-HEP",
    async search(query, signal) {
      const cited = inspireCitationQuery(query);
      let within: string | undefined;
      let words = inspireWords(query);
      if (cited) {
        const id = await recordId(cited.work, signal);
        if (id === undefined && !cited.work.startsWith("title:")) {
          throw new SourceError(`INSPIRE has no record ${cited.work.replace(/^recid:/, "").replace(/^doi:/, "with DOI ").replace(/^arxiv:/, "for arXiv paper ")}.`);
        }
        // A title that names no record is a topic after all: it is searched as words.
        if (id !== undefined) {
          within = `${cited.direction === "references" ? "citedby" : "refersto"}:recid:${id}`;
          words = inspireWords(cited.terms);
        }
      }
      let found: InspireRecord[] = [];
      // Within a paper's citations, a topic that matches none of them lists them all, most cited first.
      for (const tried of within ? [...wordTries(words), []] : wordTries(words)) {
        found = await byWords(tried, within, signal);
        if (found.length) break;
      }
      return found.map((record) => {
        const abstract = abstractOf(record);
        return { id: inspireDocId(record), title: hitTitle(record), snippet: abstract ? snippetOf(abstract) : "No abstract." };
      });
    },
    async fetch(id, signal) {
      const key = id.slice(PREFIX.length);
      if (!/^\d+$/.test(key)) throw new SourceError(`"${id}" is not an INSPIRE record ID.`);
      const record = (await records(`recid:${key}`, 1, READ_FIELDS, signal))[0];
      if (!record) throw new SourceError(`INSPIRE has no record ${key}.`);
      const arxiv = arxivOf(record);
      if (readers.arxiv && arxiv) {
        try {
          return fullTextDocument(record, await readers.arxiv.fetch(`arxiv:${arxiv}`, signal), readers.arxiv.label);
        } catch (error) {
          if (signal?.aborted) throw error;
          // Read it as its abstract.
        }
      }
      return {
        id: inspireDocId(record),
        title: titleOf(record),
        text: recordText(record),
        url: `https://inspirehep.net/literature/${record.control_number}`,
        retrievedAt: new Date().toISOString(),
        work: inspireWorkInfo(record),
      };
    },
  };
}

/**
 * A record read in full from arXiv: under its INSPIRE ID, with INSPIRE's details first (journal reference,
 * citations, TeX key) and then the paper. The reference keeps INSPIRE's details, which name the published
 * version, with the arXiv DOI when the journal's is missing.
 */
function fullTextDocument(record: InspireRecord, read: FetchedDocument, label: string): FetchedDocument {
  const head = `${recordText({ ...record, abstracts: [] }).replace(/\nINSPIRE has no abstract for this record\.$/, "")}\nFull text, read from ${label}:\n\n`;
  const info = inspireWorkInfo(record);
  return {
    id: inspireDocId(record),
    title: titleOf(record),
    text: head + read.text,
    url: read.url,
    retrievedAt: read.retrievedAt,
    work: info.doi || !read.work?.doi ? info : { ...info, doi: read.work.doi },
    ...(read.pageStarts ? { pageStarts: read.pageStarts.map((start) => start + head.length) } : {}),
  };
}
