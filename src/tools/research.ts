// Research tools over a document index: search, read, and the final answer.

import { z } from "zod";
import type { AgentTool } from "../agent/agent.ts";
import type { EvidenceItem } from "../agent/evidence.ts";
import { parentId } from "../documents/chunk.ts";
import type { SourceSession } from "../sources/session.ts";
import { SourceError } from "../sources/types.ts";
import { latinLanguage } from "../documents/languages.ts";
import { mainScript } from "../documents/scripts.ts";
import type { DocumentIndex, SearchHit } from "./search.ts";

export const RESEARCH_SYSTEM = `You are a research agent. Answer the user's question using only documents you find with the tools, not outside knowledge.
Search first, then read the documents you need. Some documents are outdated or corrected by later ones; prefer the most recent correction.
Finish with final_answer. For each document that supports the answer, give its ID and a short quote copied word for word from that document.
If the documents do not contain the answer, set "found" to false, say what is missing, and give no evidence. Never guess.`;

/**
 * The system prompt. With only the user's documents it is RESEARCH_SYSTEM exactly, so
 * benchmark results stay comparable; open sources add one line about where to look.
 */
export function researchSystem(options: { documents: boolean; sources: string[] }): string {
  if (!options.sources.length) return RESEARCH_SYSTEM;
  const sources = options.sources.join(" and ");
  const where = options.documents
    ? `You can also search ${sources}. Look in the user's documents first: search them and read what you find. Then search ${sources} too, and combine what you find: prefer the user's documents for anything specific to them, use the other sources for background and for what the documents do not cover, and say so when sources disagree.`
    : `Search ${options.sources.length > 1 ? `each of ${sources}` : sources} to find documents.`;
  return `${RESEARCH_SYSTEM}\n${where}\nSearch snippets can be cut off; quote only complete text, preferably from what you read. Keep each quote to one sentence.`;
}

/** Documents longer than this are truncated when read, to fit small context windows. */
export const MAX_DOC_CHARS = 2400;

export interface ResearchFinal {
  found: boolean;
  answer: string;
  evidence: EvidenceItem[];
}

/** Answers shorter than this (textWeight) are not checked for their language: "3776.12 m" says too little. */
const MIN_JUDGED_REPLY = 12;

/**
 * How an answer's language differs from the question's: their writing systems ("Latin script",
 * "Chinese or Japanese script"), or in Latin script their languages ("French", "English").
 * Undefined when they agree, or when the answer is too short or mixed to tell.
 */
export function languageMismatch(question: string, answer: string): { asked: string; wrote: string } | undefined {
  const asked = mainScript(question);
  const wrote = mainScript(answer);
  if (!asked || !wrote || wrote.weight < MIN_JUDGED_REPLY) return undefined;
  if (wrote.script !== asked.script) return { asked: `${asked.script} script`, wrote: `${wrote.script} script` };
  if (asked.script !== "Latin") return undefined;
  const [askedIn, wroteIn] = [latinLanguage(question), latinLanguage(answer)];
  return askedIn && wroteIn && askedIn !== wroteIn ? { asked: askedIn, wrote: wroteIn } : undefined;
}

/** The writing system a document language from documentLanguage() is written in, as mainScript() names it. */
function scriptOfLanguage(language: string): string {
  if (language === "Japanese" || language === "Chinese") return "Chinese or Japanese";
  if (language === "Korean") return "Korean";
  return language.endsWith(" script") ? language.slice(0, -" script".length) : "Latin";
}

/** Translates search terms into a language, or gives undefined (research.ts asks the model). */
export type Translate = (query: string, language: string) => Promise<string | undefined>;

/**
 * `question`, when given, lets final_answer check that the answer is in the question's language.
 * `languages`, the documents' languages (documentLanguages()), with `translate`, lets search find
 * documents in another writing system than the query: the terms are translated and searched too.
 */
export function createResearchTools(
  index: DocumentIndex,
  session?: SourceSession,
  question?: string,
  languages: string[] = [],
  translate?: Translate,
): AgentTool[] {
  const hasDocuments = index.size > 0;
  let searchedDocuments = false;
  let foundDocuments = false;
  let readDocument = false;
  // Search tools whose last search found results that have not been read yet. On the class 1
  // laptop the model searched the Papyrus PDF five times with small rewordings before reading
  // it, spending 5 of its 8 steps; a search that found something now has to be followed by a read.
  const unread = new Set<string>();
  // Whether final_answer has already sent the model back to read before concluding "not found",
  // or to answer in the question's language. Each is asked once.
  let askedToRead = false;
  let askedForLanguage = false;
  // Documents and parts the model has read, and whether final_answer has sent it back to read what it quotes.
  const readIds = new Set<string>();
  let askedToReadCited = false;
  // A quote from a part counts as read when that part was, and from a whole document when any of its
  // parts was. An open source picks the part it shows (sources/session.ts), so any read of it counts.
  const wasRead = (id: string) =>
    readIds.has(id) ||
    [...readIds].some((read) => parentId(read) === id || (session?.sourceFor(id) !== undefined && parentId(read) === parentId(id)));
  // Every source the user ticked is searched before the answer, so it can draw on all of them.
  const searchedSources = new Set<string>();
  const sourceSearches: AgentTool[] = (session?.sources ?? []).map((source) => ({
    name: `search_${source.name}`,
    usage: `{"tool":"search_${source.name}","args":{"query":"..."}} searches ${source.label} and returns IDs, titles and snippets.`,
    args: z.object({ query: z.string() }).strict(),
    execute: async ({ query }: { query: string }) => {
      searchedSources.add(source.name);
      try {
        const hits = await source.search(query, session?.signal);
        session?.noteHits(hits.map((h) => h.id));
        if (!hits.length) return { text: `No matching ${source.label} results.`, resultCount: 0 };
        unread.add(`search_${source.name}`);
        return { text: hits.map((h) => `[${h.id}] ${h.title}\n${h.snippet}`).join("\n\n"), resultCount: hits.length };
      } catch (error) {
        if (error instanceof SourceError) return { text: session!.noteError(error.message), failed: true };
        throw error;
      }
    },
    onRepeat: () => ({ hint: `Searching ${source.label} is no longer available: read one of the results with read.` }),
    // The user's documents come first: small models otherwise skip them for the open sources.
    // On the class 1 laptop a question about the user's PDF was answered from Wikipedia, first
    // without searching the PDF and then, with a search required, without reading it. So the
    // open sources open up once a document has been read, or when searching them found nothing.
    available: () => !unread.has(`search_${source.name}`) && openSourcesOpen(),
  }));
  const openSourcesOpen = () => !hasDocuments || readDocument || (searchedDocuments && !foundDocuments);
  // final_answer waits for the unsearched sources, and the model has to be told: on the class 1
  // check Qwen3.5-2B, unable to answer and not told why, read the PDF part after part instead.
  const nextSources = (observation: string) => {
    const unsearched = (session?.sources ?? []).filter((source) => !searchedSources.has(source.name));
    return unsearched.length && openSourcesOpen()
      ? `${observation}\n\nBefore you answer, also search ${unsearched.map((source) => source.label).join(" and ")} (${unsearched.map((source) => `search_${source.name}`).join(", ")}).`
      : observation;
  };
  // Search across languages: search matches words, so an English query finds nothing in a Japanese
  // document, and told to search in the documents' languages, in the prompt or when concluding
  // "not found", Qwen3.5-2B and 4B still searched in English (field suite f37-f39). So search
  // translates the terms into each document language written in another script than the query,
  // and adds the best match in that language. Languages sharing the query's script (French for an
  // English query) are not translated: short queries cannot be told apart, and often share names.
  const translatedHits = async (query: string, hits: SearchHit[]) => {
    const script = mainScript(query)?.script;
    if (!translate || !script) return [];
    const found: Array<{ language: string; terms: string; hit: SearchHit }> = [];
    for (const language of languages.filter((l) => scriptOfLanguage(l) !== script)) {
      const terms = await translate(query, language);
      if (!terms) continue;
      const hit = index
        .search(terms)
        .find((h) => mainScript(index.get(h.docId)!.text)?.script === scriptOfLanguage(language) && !hits.some((x) => x.docId === h.docId));
      if (hit) found.push({ language, terms, hit });
    }
    return found;
  };
  // Document IDs are limited to ones the task has seen, so under constrained decoding the
  // model cannot read or cite a mistyped ID (seen: "wikiped:Ada_Lovelace", a bare "W7150387116").
  const localIds = index.ids();
  const docId = () => {
    const known = [...localIds, ...(session?.knownIds() ?? [])];
    return known.length ? z.enum(known as [string, ...string[]]) : z.string();
  };
  const tools: AgentTool[] = [
    {
      name: "search",
      usage: `{"tool":"search","args":{"query":"..."}} searches the documents and returns IDs, titles and snippets.`,
      args: z.object({ query: z.string() }).strict(),
      execute: async ({ query }: { query: string }) => {
        searchedDocuments = true;
        const hits = index.search(query);
        const translated = await translatedHits(query, hits);
        foundDocuments ||= hits.length + translated.length > 0;
        // Counted in documents, not passages: a PDF found in three passages is one document to the user.
        if (!hits.length && !translated.length) return { text: nextSources("No matching documents."), resultCount: 0 };
        unread.add("search");
        const text = [
          ...hits.map((h) => `[${h.docId}] ${h.title}\n${h.snippet}`),
          ...translated.map(({ language, terms, hit }) => `Found by searching the ${language} documents for "${terms}":\n[${hit.docId}] ${hit.title}\n${hit.snippet}`),
        ].join("\n\n");
        return { text, resultCount: new Set([...hits, ...translated.map((t) => t.hit)].map((h) => parentId(h.docId))).size };
      },
      onRepeat: () => ({ hint: "Searching is no longer available: read one of the documents it found with read." }),
      available: () => !unread.has("search"),
    },
    {
      name: "read",
      usage: `{"tool":"read","args":{"docId":"..."}} returns the full text of a document.`,
      args: () => z.object({ docId: docId() }).strict(),
      execute: async ({ docId }: { docId: string }) => {
        if (session?.sourceFor(docId)) {
          unread.clear();
          readIds.add(docId);
          return nextSources(await session.read(docId));
        }
        const doc = index.get(docId);
        if (!doc) {
          const parts = index.partsOf(docId);
          return parts.length
            ? `Document "${docId}" is long and split into parts: ${parts.join(", ")}. Read the part you need, or search to find it.`
            : `No document with ID "${docId}". Use an ID returned by search.`;
        }
        readDocument = true;
        readIds.add(doc.id);
        unread.clear();
        return nextSources(`[${doc.id}] ${doc.title}\n${doc.text.slice(0, MAX_DOC_CHARS)}`);
      },
      onRepeat: ({ docId }: { docId: string }) => {
        const parts = session?.sourceFor(docId) ? session.partsOf(docId) : index.partsOf(parentId(docId));
        const others = parts.filter((id) => id !== docId);
        return others.length
          ? { hint: `This document has other parts: ${others.join(", ")}. Read another part, or search for something else.`, keepAfterRepeat: true }
          : { hint: "Search for something else, or read another document." };
      },
    },
    {
      name: "final_answer",
      usage: `{"tool":"final_answer","args":{"found":true,"answer":"...","evidence":[{"docId":"doc-id","quote":"words copied exactly from the document"}]}} finishes the task.`,
      args: () =>
        z
          .object({
            found: z.boolean(),
            answer: z.string(),
            evidence: z.array(z.object({ docId: docId(), quote: z.string() }).strict()),
          })
          .strict(),
      // Without open sources this is always true, so the benchmark's tasks are unaffected.
      available: () => (session?.sources ?? []).every((source) => searchedSources.has(source.name)),
      // Read before "not found": a search's snippets are one sentence of each document, and both
      // models concluded from them that a document lacked an answer it had (field suite f19, f30).
      // Asked once, so after reading the model can still conclude that the answer is not there.
      objection: ({ found, answer, evidence }: ResearchFinal) => {
        if (!found && unread.size && !askedToRead) {
          askedToRead = true;
          return {
            message:
              "Before concluding that the documents do not answer the question, read what your search found: each snippet is only one sentence of its document. Read the most relevant result with read.",
            step: "About to conclude that the sources don't answer this; reading what the search found first",
          };
        }
        // Read before answering, the same guard for an answer: a snippet is one sentence and can cut a
        // number off. Qwen3.5-4B answered pdf task p04 from two snippets, "spent EUR on security
        // audits", without reading the report that gives the 96,000. Asked once.
        const unreadCited = found && !askedToReadCited ? [...new Set(evidence.map((e) => e.docId).filter((id) => !wasRead(id)))] : [];
        if (unreadCited.length) {
          askedToReadCited = true;
          const what = unreadCited.length === 1 ? unreadCited[0] : unreadCited.join(", ");
          return {
            message: `Your answer quotes ${what}, which you have seen only as a search snippet. A snippet is one sentence of its document and can leave out a number or a condition. Read ${unreadCited.length === 1 ? "it" : "them"} with read, then answer.`,
            step: "About to answer from search snippets; reading the documents it quotes first",
          };
        }
        // Reply in the question's language: Qwen3.5-4B answered a Japanese question in English
        // (field suite f28). Writing systems are compared first; in Latin script, the languages
        // that function words tell apart (languages.ts), so an English answer to French is noticed.
        const mismatch = question && !askedForLanguage ? languageMismatch(question, answer) : undefined;
        if (!mismatch) return undefined;
        askedForLanguage = true;
        return {
          message: `The question is written in ${mismatch.asked}, but your answer is in ${mismatch.wrote}. Write the answer in the language of the question, and keep each quote exactly as it is in its document.`,
          step: "Answered in another language than the question; asking for the answer in the question's language",
        };
      },
    },
  ];
  // Without documents of the user's own, only the open sources can be searched.
  return [...(hasDocuments ? tools : tools.filter((t) => t.name !== "search")), ...sourceSearches].sort(
    (a, b) => Number(a.name === "final_answer") - Number(b.name === "final_answer"),
  );
}

