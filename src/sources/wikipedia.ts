// Wikipedia through the MediaWiki Action API. origin=* allows anonymous
// cross-origin requests from any page.

import { getJson, SourceError, stripTags, type FetchLike, type OpenSource } from "./types.ts";

const PREFIX = "wikipedia:";

/** Wikipedia language editions are subdomains such as "en" or "ja". */
export function isWikipediaLanguage(code: string): boolean {
  return /^[a-z]{2,3}(-[a-z]+)?$/.test(code);
}

export function createWikipedia(language = "en", fetchImpl: FetchLike = fetch): OpenSource {
  if (!isWikipediaLanguage(language)) throw new Error(`Not a Wikipedia language code: ${language}`);
  const api = `https://${language}.wikipedia.org/w/api.php`;
  const params = (extra: Record<string, string>) =>
    new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...extra }).toString();
  const toId = (title: string) => PREFIX + title.replace(/ /g, "_");
  const fromId = (id: string) => id.slice(PREFIX.length).replace(/_/g, " ");

  return {
    name: "wikipedia",
    label: language === "en" ? "Wikipedia" : `Wikipedia (${language})`,
    async search(query, signal) {
      const data = await getJson(
        fetchImpl,
        "Wikipedia",
        `${api}?${params({ action: "query", list: "search", srsearch: query, srlimit: "5", srprop: "snippet" })}`,
        signal,
      );
      const results: Array<{ title: string; snippet?: string }> = data?.query?.search ?? [];
      return results.map((r) => ({ id: toId(r.title), title: r.title, snippet: stripTags(r.snippet ?? "") }));
    },
    async fetch(id, signal) {
      const data = await getJson(
        fetchImpl,
        "Wikipedia",
        `${api}?${params({ action: "query", prop: "extracts|info", inprop: "url", explaintext: "1", redirects: "1", titles: fromId(id) })}`,
        signal,
      );
      const page = data?.query?.pages?.[0];
      if (!page || page.missing || typeof page.extract !== "string") {
        throw new SourceError(`Wikipedia has no article "${fromId(id)}".`);
      }
      return {
        id: toId(page.title),
        title: page.title,
        text: page.extract.trim(),
        url: page.fullurl ?? `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
        retrievedAt: new Date().toISOString(),
      };
    },
  };
}
