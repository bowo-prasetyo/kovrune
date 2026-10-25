// Scholarly works through the OpenAlex API, which allows cross-origin requests.
// Abstracts come as an inverted index (word -> positions) and are rebuilt here.

import { getJson, SourceError, type FetchLike, type OpenSource } from "./types.ts";

const PREFIX = "openalex:";
const API = "https://api.openalex.org/works";
const FIELDS = "id,display_name,publication_year,doi,authorships,abstract_inverted_index,primary_location";

interface Work {
  id: string;
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

export function createOpenAlex(fetchImpl: FetchLike = fetch): OpenSource {
  return {
    name: "openalex",
    label: "OpenAlex",
    async search(query, signal) {
      const params = new URLSearchParams({ search: query, "per-page": "5", select: FIELDS });
      const data = await getJson(fetchImpl, "OpenAlex", `${API}?${params}`, signal);
      const works: Work[] = data?.results ?? [];
      return works.map((work) => {
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
      const work: Work = await getJson(fetchImpl, "OpenAlex", `${API}/${key}?${new URLSearchParams({ select: FIELDS })}`, signal);
      return {
        id: workId(work),
        title: work.display_name ?? "Untitled",
        text: workText(work),
        url: work.doi ?? `https://openalex.org/${key}`,
        retrievedAt: new Date().toISOString(),
      };
    },
  };
}
