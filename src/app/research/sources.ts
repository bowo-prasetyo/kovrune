// Which open sources the user lets the agent search. Off by default: searching them
// sends the model's search words to Wikipedia or OpenAlex (arXiv is searched through
// OpenAlex), and reading an arXiv paper downloads its PDF from arxiv.org.

import { extractPdfText } from "../../documents/extract.ts";
import { loadBrowserPdfJs } from "../../documents/pdf-browser.ts";
import { createArxiv } from "../../sources/arxiv.ts";
import { createOpenAlex } from "../../sources/openalex.ts";
import type { OpenSource } from "../../sources/types.ts";
import { createWikipedia, isWikipediaLanguage } from "../../sources/wikipedia.ts";

export interface SourcePrefs {
  wikipedia: boolean;
  /** Wikipedia language edition, e.g. "en" or "ja". */
  language: string;
  openalex: boolean;
  /** arXiv preprints, found through OpenAlex and read whole from their PDFs. */
  arxiv: boolean;
  /**
   * The user's own OpenAlex API key, for OpenAlex and arXiv searches; empty for none. Without one,
   * requests share a small daily budget with everyone on the same IP address. Kept in this browser
   * only, and sent only to OpenAlex. Backups do not include it.
   */
  openalexKey: string;
}

const KEY = "kovrune.sources.v1";

/** The Wikipedia edition matching the browser's language, or English. */
export function defaultLanguage(browserLanguage: string | undefined): string {
  const code = browserLanguage?.toLowerCase().split("-")[0] ?? "";
  return isWikipediaLanguage(code) ? code : "en";
}

export function parseSourcePrefs(raw: string | null, browserLanguage?: string): SourcePrefs {
  const defaults: SourcePrefs = { wikipedia: false, language: defaultLanguage(browserLanguage), openalex: false, arxiv: false, openalexKey: "" };
  try {
    const value = JSON.parse(raw ?? "null") as Partial<SourcePrefs> | null;
    if (!value) return defaults;
    return {
      wikipedia: value.wikipedia === true,
      language: typeof value.language === "string" && isWikipediaLanguage(value.language) ? value.language : defaults.language,
      openalex: value.openalex === true,
      arxiv: value.arxiv === true,
      openalexKey: typeof value.openalexKey === "string" ? value.openalexKey.trim() : "",
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

export function openSourcesFor(prefs: SourcePrefs): OpenSource[] {
  return [
    ...(prefs.wikipedia ? [createWikipedia(prefs.language)] : []),
    ...(prefs.openalex ? [createOpenAlex(fetch, prefs.openalexKey)] : []),
    ...(prefs.arxiv ? [createArxiv({ apiKey: prefs.openalexKey, extractPdf: async (bytes) => extractPdfText(bytes, await loadBrowserPdfJs()) })] : []),
  ];
}

/** Whether any open source is ticked, so questions can be asked without documents. */
export function anyOpenSource(prefs: SourcePrefs): boolean {
  return prefs.wikipedia || prefs.openalex || prefs.arxiv;
}

/** The ticked open sources' names, as the user sees them: "Wikipedia", "OpenAlex", "arXiv". */
export function openSourceNames(prefs: SourcePrefs): string[] {
  return [...(prefs.wikipedia ? ["Wikipedia"] : []), ...(prefs.openalex ? ["OpenAlex"] : []), ...(prefs.arxiv ? ["arXiv"] : [])];
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
