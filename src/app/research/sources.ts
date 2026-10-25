// Which open sources the user lets the agent search. Off by default: searching them
// sends the model's search words to Wikipedia or OpenAlex.

import { createOpenAlex } from "../../sources/openalex.ts";
import type { OpenSource } from "../../sources/types.ts";
import { createWikipedia, isWikipediaLanguage } from "../../sources/wikipedia.ts";

export interface SourcePrefs {
  wikipedia: boolean;
  /** Wikipedia language edition, e.g. "en" or "ja". */
  language: string;
  openalex: boolean;
}

const KEY = "kovrune.sources.v1";

/** The Wikipedia edition matching the browser's language, or English. */
export function defaultLanguage(browserLanguage: string | undefined): string {
  const code = browserLanguage?.toLowerCase().split("-")[0] ?? "";
  return isWikipediaLanguage(code) ? code : "en";
}

export function parseSourcePrefs(raw: string | null, browserLanguage?: string): SourcePrefs {
  const defaults: SourcePrefs = { wikipedia: false, language: defaultLanguage(browserLanguage), openalex: false };
  try {
    const value = JSON.parse(raw ?? "null") as Partial<SourcePrefs> | null;
    if (!value) return defaults;
    return {
      wikipedia: value.wikipedia === true,
      language: typeof value.language === "string" && isWikipediaLanguage(value.language) ? value.language : defaults.language,
      openalex: value.openalex === true,
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
  return [...(prefs.wikipedia ? [createWikipedia(prefs.language)] : []), ...(prefs.openalex ? [createOpenAlex()] : [])];
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
