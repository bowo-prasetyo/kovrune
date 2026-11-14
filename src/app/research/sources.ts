// Which open sources the user lets the agent search. Off by default: searching them
// sends the model's search words to Wikipedia, OpenAlex, DataCite or Europe PMC (arXiv is
// searched through DataCite), reading an arXiv paper downloads its PDF from arxiv.org, and
// reading a DataCite work on Zenodo downloads its record and PDF from zenodo.org.

import { extractPdfText } from "../../documents/extract.ts";
import { loadBrowserPdfJs } from "../../documents/pdf-browser.ts";
import { createArxiv } from "../../sources/arxiv.ts";
import { createDataCite } from "../../sources/datacite.ts";
import { createEuropePmc } from "../../sources/europepmc.ts";
import { createOpenAlex, OPENALEX_FIELDS } from "../../sources/openalex.ts";
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
  /** OpenAlex searches find only works in this field of research (OPENALEX_FIELDS); "" for any field. */
  openalexField?: string;
}

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
      ...(typeof value.openalexField === "string" && OPENALEX_FIELDS.some(([id]) => id === value.openalexField) ? { openalexField: value.openalexField } : {}),
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
 * The ticked sources. OpenAlex reads a work in full from arXiv or Europe PMC only when that source is
 * ticked too, so no site is asked that the user did not choose (openalex.ts).
 */
export function openSourcesFor(prefs: SourcePrefs): OpenSource[] {
  const arxiv = prefs.arxiv ? createArxiv({ extractPdf }) : undefined;
  const europepmc = prefs.europepmc ? createEuropePmc() : undefined;
  const filters = { fromYear: prefs.openalexFromYear, openAccess: prefs.openalexOpenAccess, field: prefs.openalexField };
  return [
    ...(prefs.wikipedia ? [createWikipedia(prefs.language)] : []),
    ...(prefs.openalex ? [createOpenAlex(fetch, prefs.openalexKey, filters, { arxiv, europepmc })] : []),
    ...(arxiv ? [arxiv] : []),
    ...(prefs.datacite ? [createDataCite({ extractPdf })] : []),
    ...(europepmc ? [europepmc] : []),
  ];
}

/** Whether any open source is ticked, so questions can be asked without documents. */
export function anyOpenSource(prefs: SourcePrefs): boolean {
  return prefs.wikipedia || prefs.openalex || prefs.arxiv || prefs.datacite || prefs.europepmc;
}

/** The ticked open sources' names, as the user sees them: "Wikipedia", "OpenAlex", "arXiv", "DataCite", "Europe PMC". */
export function openSourceNames(prefs: SourcePrefs): string[] {
  return [...(prefs.wikipedia ? ["Wikipedia"] : []), ...(prefs.openalex ? ["OpenAlex"] : []), ...(prefs.arxiv ? ["arXiv"] : []), ...(prefs.datacite ? ["DataCite"] : []), ...(prefs.europepmc ? ["Europe PMC"] : [])];
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
