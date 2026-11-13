// Europe PMC: the biomedical and life-sciences literature, in one search: PubMed's records, PubMed
// Central's full texts, and preprints (medRxiv, bioRxiv and others). Its REST API allows requests from
// web pages (Access-Control-Allow-Origin: *) and needs no key.
//
// A search shows what a researcher sorts by before reading: the year, journal and kind of study
// (randomized controlled trial, systematic review, preprint), whether the work can be read in full, and
// whether it was retracted. Reading an open-access work gives its full text, from Europe PMC's JATS
// XML (sources/jats.ts), with its tables, which hold what abstracts leave out (a trial's baseline
// characteristics, adverse events, subgroups); the clinical suite's documents are that same text
// (eval/clinical). Any other work is read as its abstract, as OpenAlex works are.

import { jatsToMarkdown, parseXml } from "./jats.ts";
import { snippetOf } from "./openalex.ts";
import { getBytes, getJson, SourceError, type FetchLike, type FetchedDocument, type OpenSource, type WorkInfo } from "./types.ts";

const PREFIX = "europepmc:";
export const EUROPEPMC_API = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const HITS = 5;
/**
 * Results asked for, of which the HITS that best match are shown (rankHits). Europe PMC ranks a paper by
 * the words of a query anywhere in its full text, so the papers that followed a trial, which name it in
 * their methods, ranked above its own report: "REVAMP trial oral iron standard-of-care" put the REVAMP
 * report 16th, after a secondary analysis, two substudies and papers that cite it (eval/clinical/README.md).
 * 25 records are about 44 kB compressed, 0.2 s more than 5.
 */
const CANDIDATES = 25;
/**
 * How much a paper's citations raise its match: its share of the query's words in its title and abstract
 * is multiplied by 1 + CITATION_WEIGHT × log10(1 + citations), so a paper cited 100 times counts 1.6 times
 * its match. A trial's own report is cited more than the papers that followed it. Scaling the match, not
 * adding to it, keeps citations from lifting a paper that matches little: added, at 0.2, the American Heart
 * Association's yearly statistics (cited thousands of times, 1 of 12 words) took three of the five places
 * for a search on the VESSEL trial. On the clinical suite's questions and the model's own searches, 0.3
 * found as many papers as no weight (16 of 21 questions in the top five), put more first (15 against 13),
 * and added one hit matching under half the words in 135 (eval/clinical/README.md).
 */
export const CITATION_WEIGHT = 0.3;
/** A full text can take Europe PMC several seconds to give (18 s for a preprint in a check); the abstract is read if it takes longer. */
export const FULL_TEXT_TIMEOUT_MS = 60_000;
/** Only records with something to read: an abstract, or an open-access full text. */
const READABLE = "(HAS_ABSTRACT:y OR OPEN_ACCESS:y)";

/** A Europe PMC record, as far as Kovrune reads it (resultType=core). */
export interface EuropePmcRecord {
  /** The record's ID in its source: a PMID for MED, a PMCID for PMC, "PPR…" for preprints. */
  id: string;
  /** "MED" (PubMed), "PMC", "PPR" (preprints), "AGR", "CBA", "CTX", "ETH", "HIR", "PAT". */
  source: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  authorList?: { author?: Array<{ fullName?: string; collectiveName?: string }> };
  journalInfo?: { journal?: { title?: string } };
  bookOrReportDetails?: { publisher?: string };
  pubYear?: string;
  abstractText?: string;
  citedByCount?: number;
  pubTypeList?: { pubType?: string[] };
  isOpenAccess?: "Y" | "N";
}

/** Record sources and IDs as Europe PMC's own article URLs name them: "MED/38012345", "PPR/PPR1326190". */
const ID = /^([A-Z]{3})\/([A-Za-z0-9.]+)$/;

/** The ID the model sees for a record, e.g. "europepmc:MED/38012345". */
export function europePmcDocId(record: Pick<EuropePmcRecord, "source" | "id">): string {
  return `${PREFIX}${record.source}/${record.id}`;
}

const pubTypes = (record: EuropePmcRecord) => record.pubTypeList?.pubType ?? [];

/** Whether Europe PMC marks the work as retracted, or as the notice of a retraction. */
export function retraction(record: EuropePmcRecord): "retracted" | "notice" | undefined {
  const types = pubTypes(record).map((t) => t.toLowerCase());
  if (types.includes("retracted publication")) return "retracted";
  if (types.includes("retraction of publication")) return "notice";
  return undefined;
}

/** The kinds of study a researcher sorts by, in the order they are named; Europe PMC gives PubMed's and the publishers' types. */
const STUDY_TYPES: Array<[RegExp, string]> = [
  [/^systematic review$/i, "systematic review"],
  [/^meta-analysis$/i, "meta-analysis"],
  [/^randomized controlled trial$/i, "randomized controlled trial"],
  [/^clinical trial(, phase [iv]+)?$/i, "clinical trial"],
  [/^(observational study|comparative study)$/i, "observational study"],
  [/^(practice )?guideline$/i, "guideline"],
  [/^(review|review-article)$/i, "review"],
  [/^case reports?$/i, "case report"],
  [/^preprint$/i, "preprint"],
  [/^(editorial|letter|comment|article-commentary|news)$/i, "commentary"],
];

/** The kinds of study a record is, e.g. ["randomized controlled trial"]; at most two. */
export function studyTypes(record: EuropePmcRecord): string[] {
  const types = pubTypes(record);
  const named = STUDY_TYPES.filter(([pattern]) => types.some((t) => pattern.test(t.trim()))).map(([, name]) => name);
  return [...new Set(named)].slice(0, 2);
}

/** The ID of the record's open-access full text, if Europe PMC has one: its PMCID, or a preprint's own ID. */
export function fullTextId(record: EuropePmcRecord): string | undefined {
  if (record.isOpenAccess !== "Y") return undefined;
  if (record.pmcid) return record.pmcid;
  return record.source === "PPR" ? record.id : undefined;
}

function venueOf(record: EuropePmcRecord): string | undefined {
  return (record.journalInfo?.journal?.title ?? record.bookOrReportDetails?.publisher)?.trim() || undefined;
}

function authorsOf(record: EuropePmcRecord): string[] {
  const listed = (record.authorList?.author ?? []).map((a) => (a.fullName ?? a.collectiveName)?.trim()).filter((name): name is string => Boolean(name));
  if (listed.length) return listed;
  return (record.authorString ?? "")
    .replace(/\.$/, "")
    .split(", ")
    .map((name) => name.trim())
    .filter(Boolean);
}

/** An abstract as text: Europe PMC's HTML (<h4>Background</h4>, <sup>, <i>) to lines and words. */
export function abstractOf(record: EuropePmcRecord): string {
  return (record.abstractText ?? "")
    .replace(/<\/?(h\d|p|br|div)[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function titleOf(record: EuropePmcRecord): string {
  return (record.title ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || "Untitled";
}

/** What a search result says besides its title: "(2024, The Lancet; randomized controlled trial; full text)". */
/**
 * A paper that reports on a trial without being its main report, from its title or publication type:
 * a secondary or post-hoc analysis, a substudy, or the trial's protocol. Named in search results, so the
 * model can tell them from the report a question asks about.
 */
export function relatedReport(record: EuropePmcRecord): "secondary analysis" | "protocol" | undefined {
  const title = titleOf(record);
  if (pubTypes(record).some((t) => /^(clinical trial protocol|study protocol)$/i.test(t.trim())) || /\b(protocol|statistical analysis plan)\b/i.test(title)) return "protocol";
  if (/\b(secondary|post[- ]?hoc|ancillary|exploratory) analys[ie]s\b|\bsub-?stud(y|ies)\b/i.test(title)) return "secondary analysis";
  return undefined;
}

/** Text compared without case or accents. */
const fold = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/**
 * The HITS records that best match the query: by the share of its words in a record's title and abstract,
 * raised by its citations (CITATION_WEIGHT); Europe PMC's order breaks ties.
 */
export function rankHits(records: EuropePmcRecord[], terms: string[]): EuropePmcRecord[] {
  const words = terms.map(fold);
  return records
    .map((record, at) => {
      const text = fold(`${titleOf(record)} ${abstractOf(record)}`);
      const share = words.length ? words.filter((word) => text.includes(word)).length / words.length : 0;
      return { record, at, score: share * (1 + CITATION_WEIGHT * Math.log10(1 + (record.citedByCount ?? 0))) };
    })
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, HITS)
    .map(({ record }) => record);
}

function aboutOf(record: EuropePmcRecord): string {
  const where = [record.pubYear, venueOf(record)].filter(Boolean).join(", ");
  const retracted = retraction(record);
  return [
    ...(retracted === "retracted" ? ["RETRACTED"] : retracted === "notice" ? ["retraction notice"] : []),
    ...(where ? [where] : []),
    ...(studyTypes(record).length ? [studyTypes(record).join(", ")] : []),
    ...(relatedReport(record) ? [relatedReport(record)!] : []),
    fullTextId(record) ? "full text" : "abstract only",
  ].join("; ");
}

/** A warning put first in the text of a retracted work, so the model and the reader see it. */
export const RETRACTED_NOTE = "Note: Europe PMC marks this publication as retracted. Its findings should not be relied on.";

/**
 * A note put first in a trial protocol's text. A protocol is written before the trial is run, so it gives
 * what was planned: asked the REVAMP trial's oral iron dose, Qwen3.5-4B read the trial's report, then its
 * protocol, and answered with the protocol's plan (eval/clinical/README.md).
 */
export const PROTOCOL_NOTE = "Note: this is a trial protocol, written before the trial was run. It gives what was planned, not what was done or found; those are in the trial's own report.";

/** The notes a work's text starts with: a retraction, or that it is a protocol. */
function notesFor(record: EuropePmcRecord): string[] {
  return [...(retraction(record) === "retracted" ? [RETRACTED_NOTE] : []), ...(relatedReport(record) === "protocol" ? [PROTOCOL_NOTE] : [])];
}

function workInfo(record: EuropePmcRecord): WorkInfo {
  const year = Number(record.pubYear);
  const venue = venueOf(record);
  return {
    authors: authorsOf(record),
    ...(Number.isInteger(year) && year > 0 ? { year } : {}),
    ...(record.doi ? { doi: record.doi.toLowerCase() } : {}),
    ...(venue ? { venue } : {}),
  };
}

/** The text of a work read as its record: title, authors, year, journal, IDs, kind of study and abstract, and why there is no more. */
export function recordText(record: EuropePmcRecord, why: string): string {
  const authors = authorsOf(record);
  const types = studyTypes(record);
  const ids = [record.doi ? `DOI: ${record.doi}` : "", record.pmid ? `PMID: ${record.pmid}` : "", record.pmcid ? `PMCID: ${record.pmcid}` : ""].filter(Boolean).join(". ");
  const abstract = abstractOf(record);
  return [
    ...notesFor(record),
    titleOf(record),
    [authors.slice(0, 5).join(", ") + (authors.length > 5 ? " et al." : ""), record.pubYear, venueOf(record)].filter(Boolean).join(". "),
    ids,
    types.length ? `Type: ${types.join(", ")}` : "",
    abstract ? `Abstract:\n${abstract}` : "Europe PMC has no abstract for this work.",
    `(${why})`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * A query Europe PMC reads as words: its search syntax (fields "TITLE:", quotes, brackets, upper-case
 * AND, OR and NOT) is taken out, so the model's words are searched as words.
 */
export function plainTerms(query: string): string[] {
  return query
    .replace(/[:"'()[\]{}^~*?\\/!+]|(^|\s)-/g, " ")
    .split(/\s+/)
    .map((word) => (/^(AND|OR|NOT)$/.test(word) ? word.toLowerCase() : word))
    .filter((word) => word && !/^(and|or|not)$/.test(word));
}

/**
 * Words that say how a question is asked, not what about. Europe PMC requires every word of a query, in
 * a work's full text as well as its abstract, so they matched nearly any paper and ranked the one asked
 * about lower: searching each of the clinical suite's questions as typed found its paper in the top five
 * for 9 of 21 questions with them, and 13 without (eval/clinical/README.md).
 */
const FUNCTION_WORDS = new Set(
  "a an the of in on at to for with by from and or not what which who whom whose when where why how was were is are be been being did does do had has have this that these those its it their there than then as into per vs versus among between after before during over under any all each".split(" "),
);

/** The words a search asks Europe PMC for: the model's words (plainTerms), without function words unless that leaves none. */
export function searchTerms(query: string): string[] {
  const terms = plainTerms(query);
  const content = terms.filter((word) => !FUNCTION_WORDS.has(word.toLowerCase()));
  return content.length ? content : terms;
}

/**
 * Europe PMC as an open source. A search asks for works matching all of the model's words, and, when
 * none do, any of them: Europe PMC requires every word, and a small model's searches are long ("IPTp
 * sulfadoxine pyrimethamine dihydroartemisinin piperaquine Malawi risk ratio" matched 81 works; two more
 * words can match none).
 */
export function createEuropePmc(fetchImpl: FetchLike = fetch): OpenSource {
  const found = new Map<string, EuropePmcRecord>();

  async function searchRecords(query: string, size: number, signal?: AbortSignal): Promise<EuropePmcRecord[]> {
    const params = new URLSearchParams({ query, format: "json", resultType: "core", pageSize: String(size) });
    const data = await getJson(fetchImpl, "Europe PMC", `${EUROPEPMC_API}/search?${params}`, signal);
    return data?.resultList?.result ?? [];
  }

  async function recordFor(source: string, id: string, signal?: AbortSignal): Promise<EuropePmcRecord> {
    const key = `${source}/${id}`;
    const known = found.get(key);
    if (known) return known;
    const [record] = await searchRecords(`EXT_ID:${id} AND SRC:${source}`, 1, signal);
    if (!record) throw new SourceError(`Europe PMC has no work ${key}.`);
    found.set(key, record);
    return record;
  }

  /** The work's full text as Markdown, or why it can't be read. */
  async function fullText(record: EuropePmcRecord, signal?: AbortSignal): Promise<string | { why: string }> {
    const id = fullTextId(record);
    if (!id) return { why: "Europe PMC has no open-access full text for this work, so only its abstract was read." };
    let bytes: Uint8Array;
    try {
      bytes = await getBytes(fetchImpl, "Europe PMC", `${EUROPEPMC_API}/${id}/fullTextXML`, signal, { timeoutMs: FULL_TEXT_TIMEOUT_MS });
    } catch (error) {
      if (signal?.aborted) throw error;
      return { why: "Europe PMC did not give this work's full text, so only its abstract was read." };
    }
    try {
      const markdown = jatsToMarkdown(parseXml(new TextDecoder().decode(bytes)), id);
      return markdown.length > 200 ? markdown : { why: "This work's full text is empty, so only its abstract was read." };
    } catch {
      return { why: "This work's full text could not be read, so only its abstract was read." };
    }
  }

  return {
    name: "europepmc",
    label: "Europe PMC",
    async search(query, signal) {
      const terms = searchTerms(query);
      if (!terms.length) return [];
      let records = await searchRecords(`(${terms.join(" ")}) AND ${READABLE}`, CANDIDATES, signal);
      if (!records.length && terms.length > 1) records = await searchRecords(`(${terms.join(" OR ")}) AND ${READABLE}`, CANDIDATES, signal);
      return rankHits(records, terms).map((record) => {
        found.set(`${record.source}/${record.id}`, record);
        const abstract = abstractOf(record).replace(/\n/g, " ");
        return { id: europePmcDocId(record), title: `${titleOf(record)} (${aboutOf(record)})`, snippet: abstract ? snippetOf(abstract) : "No abstract." };
      });
    },
    async fetch(id, signal) {
      const match = ID.exec(id.slice(PREFIX.length));
      if (!id.startsWith(PREFIX) || !match) throw new SourceError(`"${id}" is not a Europe PMC ID such as europepmc:MED/38012345.`);
      const record = await recordFor(match[1]!, match[2]!, signal);
      const text = await fullText(record, signal);
      return {
        id: europePmcDocId(record),
        title: titleOf(record),
        text: typeof text === "string" ? [...notesFor(record), text].join("\n\n") : recordText(record, text.why),
        url: `https://europepmc.org/article/${record.source}/${record.id}`,
        retrievedAt: new Date().toISOString(),
        work: workInfo(record),
      } satisfies FetchedDocument;
    },
  };
}
