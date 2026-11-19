// Which open sources the user lets the agent search. Off by default: searching them
// sends the model's search words to Wikipedia, OpenAlex, DataCite, Europe PMC or INSPIRE-HEP (arXiv is
// searched through DataCite), reading an arXiv paper downloads its PDF from arxiv.org, and
// reading a DataCite work on Zenodo downloads its record and PDF from zenodo.org.

import { extractPdfText } from "../../documents/extract.ts";
import { loadBrowserPdfJs } from "../../documents/pdf-browser.ts";
import { createArxiv, findArxivByTitle } from "../../sources/arxiv.ts";
import { createDataCite } from "../../sources/datacite.ts";
import { createEuropePmc } from "../../sources/europepmc.ts";
import { createInspire } from "../../sources/inspire.ts";
import { createOpenAlex, OPENALEX_FIELDS, OPENALEX_VENUES } from "../../sources/openalex.ts";
import { createPatents } from "../../sources/patents.ts";
import type { OpenSource } from "../../sources/types.ts";
import { createWikipedia, isWikipediaLanguage } from "../../sources/wikipedia.ts";

export interface SourcePrefs {
  wikipedia: boolean;
  /** Wikipedia language edition, e.g. "en" or "ja". */
  language: string;
  openalex: boolean;
  /** arXiv preprints, found through DataCite and read whole from their PDFs. */
  arxiv: boolean;
  /** Other repositories' works registered with DataCite; read whole from Zenodo's PDFs, else as abstracts. */
  datacite: boolean;
  /** The biomedical literature: PubMed, PubMed Central and preprints; open-access works read whole, others as abstracts. */
  europepmc: boolean;
  /**
   * The user's own OpenAlex API key, for OpenAlex searches; empty for none. Without one,
   * requests share a small daily budget with everyone on the same IP address. Kept in this browser
   * only, and sent only to OpenAlex. Backups do not include it.
   */
  openalexKey: string;
  /** OpenAlex searches find only works published in this year or later; undefined for any year. */
  openalexFromYear?: number;
  /** OpenAlex searches find only works with a free copy. */
  openalexOpenAccess?: boolean;
  /** The model is told it can follow a paper's citations through OpenAlex (experimental, off by default). */
  openalexFollowCitations?: boolean;
  /** OpenAlex searches find only works in this field of research (OPENALEX_FIELDS); "" for any field. */
  openalexField?: string;
  /** OpenAlex searches find only works from this computer science venue (OPENALEX_VENUES); "" for any venue. */
  openalexVenue?: string;
  /** High-energy physics through INSPIRE-HEP (sources/inspire.ts): records with abstracts, read whole from arXiv when arXiv is ticked. */
  inspire?: boolean;
  /** The model is told it can follow a paper's citations through INSPIRE (experimental, off by default, as for OpenAlex). */
  inspireFollowCitations?: boolean;
  /** Patents through the EPO's Open Patent Services (sources/patents.ts); searched only with a key and secret. */
  patents?: boolean;
  /**
   * The user's EPO OPS app's consumer key and secret, from the EPO developer portal; empty for none. Kept in
   * this browser only, and sent only to ops.epo.org. Backups do not include them.
   */
  epoKey?: string;
  epoSecret?: string;
}

/** Whether patents are ticked and have the key and secret OPS needs. */
export const patentsReady = (prefs: SourcePrefs) => Boolean(prefs.patents && prefs.epoKey && prefs.epoSecret);

/** A year an OpenAlex search may start from: a whole number from 1900 to next year. */
export function validFromYear(value: unknown, now = new Date()): number | undefined {
  const year = typeof value === "string" ? Number(value.trim()) : value;
  return typeof year === "number" && Number.isInteger(year) && year >= 1900 && year <= now.getFullYear() + 1 ? year : undefined;
}

const KEY = "kovrune.sources.v1";

/** The Wikipedia edition matching the browser's language, or English. */
export function defaultLanguage(browserLanguage: string | undefined): string {
  const code = browserLanguage?.toLowerCase().split("-")[0] ?? "";
  return isWikipediaLanguage(code) ? code : "en";
}

export function parseSourcePrefs(raw: string | null, browserLanguage?: string): SourcePrefs {
  const defaults: SourcePrefs = { wikipedia: false, language: defaultLanguage(browserLanguage), openalex: false, arxiv: false, datacite: false, europepmc: false, openalexKey: "" };
  try {
    const value = JSON.parse(raw ?? "null") as Partial<SourcePrefs> | null;
    if (!value) return defaults;
    return {
      wikipedia: value.wikipedia === true,
      language: typeof value.language === "string" && isWikipediaLanguage(value.language) ? value.language : defaults.language,
      openalex: value.openalex === true,
      arxiv: value.arxiv === true,
      datacite: value.datacite === true,
      europepmc: value.europepmc === true,
      openalexKey: typeof value.openalexKey === "string" ? value.openalexKey.trim() : "",
      ...(validFromYear(value.openalexFromYear) ? { openalexFromYear: validFromYear(value.openalexFromYear) } : {}),
      ...(value.openalexOpenAccess === true ? { openalexOpenAccess: true } : {}),
      ...(value.openalexFollowCitations === true ? { openalexFollowCitations: true } : {}),
      ...(typeof value.openalexField === "string" && OPENALEX_FIELDS.some(([id]) => id === value.openalexField) ? { openalexField: value.openalexField } : {}),
      ...(typeof value.openalexVenue === "string" && OPENALEX_VENUES.some(([id]) => id === value.openalexVenue) ? { openalexVenue: value.openalexVenue } : {}),
      ...(value.inspire === true ? { inspire: true } : {}),
      ...(value.inspireFollowCitations === true ? { inspireFollowCitations: true } : {}),
      ...(value.patents === true ? { patents: true } : {}),
      ...(typeof value.epoKey === "string" && value.epoKey.trim() ? { epoKey: value.epoKey.trim() } : {}),
      ...(typeof value.epoSecret === "string" && value.epoSecret.trim() ? { epoSecret: value.epoSecret.trim() } : {}),
    };
  } catch {
    return defaults;
  }
}

export function loadSourcePrefs(): SourcePrefs {
  try {
    return parseSourcePrefs(localStorage.getItem(KEY), navigator.language);
  } catch {
    return parseSourcePrefs(null, navigator.language);
  }
}

export function saveSourcePrefs(prefs: SourcePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be unavailable; the choice then lasts for this visit only.
  }
}

const extractPdf = async (bytes: Uint8Array) => extractPdfText(bytes, await loadBrowserPdfJs());

/**
 * The ticked sources. OpenAlex reads a work in full from arXiv or Europe PMC, and INSPIRE a record from
 * arXiv, only when that source is ticked too, so no site is asked that the user did not choose (openalex.ts).
 */
export function openSourcesFor(prefs: SourcePrefs): OpenSource[] {
  const arxiv = prefs.arxiv ? createArxiv({ extractPdf }) : undefined;
  const europepmc = prefs.europepmc ? createEuropePmc() : undefined;
  const filters = { fromYear: prefs.openalexFromYear, openAccess: prefs.openalexOpenAccess, field: prefs.openalexField, venue: prefs.openalexVenue };
  // A conference paper's arXiv version is looked up by its title on DataCite, which the arXiv source searches already.
  const findArxiv = arxiv ? (title: string, signal?: AbortSignal) => findArxivByTitle(fetch, title, signal) : undefined;
  return [
    ...(prefs.wikipedia ? [createWikipedia(prefs.language)] : []),
    ...(prefs.openalex ? [createOpenAlex(fetch, prefs.openalexKey, filters, { arxiv, europepmc, findArxiv }, { followCitations: prefs.openalexFollowCitations === true })] : []),
    ...(arxiv ? [arxiv] : []),
    ...(prefs.datacite ? [createDataCite({ extractPdf })] : []),
    ...(europepmc ? [europepmc] : []),
    ...(prefs.inspire ? [createInspire(fetch, { arxiv }, { followCitations: prefs.inspireFollowCitations === true })] : []),
    ...(patentsReady(prefs) ? [createPatents({ key: prefs.epoKey!, secret: prefs.epoSecret! })] : []),
  ];
}

/** Whether any open source is ticked, so questions can be asked without documents. */
export function anyOpenSource(prefs: SourcePrefs): boolean {
  return prefs.wikipedia || prefs.openalex || prefs.arxiv || prefs.datacite || prefs.europepmc || prefs.inspire === true || patentsReady(prefs);
}

/** The ticked open sources' names, as the user sees them: "Wikipedia", "OpenAlex", "arXiv", "DataCite", "Europe PMC", "INSPIRE-HEP", "EPO patents". */
export function openSourceNames(prefs: SourcePrefs): string[] {
  return [...(prefs.wikipedia ? ["Wikipedia"] : []), ...(prefs.openalex ? ["OpenAlex"] : []), ...(prefs.arxiv ? ["arXiv"] : []), ...(prefs.datacite ? ["DataCite"] : []), ...(prefs.europepmc ? ["Europe PMC"] : []), ...(prefs.inspire ? ["INSPIRE-HEP"] : []), ...(patentsReady(prefs) ? ["EPO patents"] : [])];
}

/** Common Wikipedia editions for the language picker; any valid code typed in also works. */
export const WIKIPEDIA_LANGUAGES: Array<[string, string]> = [
  ["en", "English"],
  ["ja", "日本語"],
  ["de", "Deutsch"],
  ["fr", "Français"],
  ["es", "Español"],
  ["id", "Bahasa Indonesia"],
  ["zh", "中文"],
  ["ko", "한국어"],
  ["pt", "Português"],
  ["ru", "Русский"],
];
