// Research tools over a document index: search, read, and the final answer.

import { z } from "zod";
import type { AgentTool } from "../agent/agent.ts";
import type { EvidenceItem } from "../agent/evidence.ts";
import { parentId } from "../documents/chunk.ts";
import type { SourceSession } from "../sources/session.ts";
import { SourceError } from "../sources/types.ts";
import type { DocumentIndex } from "./search.ts";

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
  const where = options.documents
    ? `You can also search ${options.sources.join(" and ")}. Look in the user's documents first; use the other sources when the documents do not answer the question.`
    : `Search ${options.sources.join(" and ")} to find documents.`;
  return `${RESEARCH_SYSTEM}\n${where}`;
}

/** Documents longer than this are truncated when read, to fit small context windows. */
export const MAX_DOC_CHARS = 2400;

export interface ResearchFinal {
  found: boolean;
  answer: string;
  evidence: EvidenceItem[];
}

export function createResearchTools(index: DocumentIndex, session?: SourceSession): AgentTool[] {
  const hasDocuments = index.size > 0;
  const sourceSearches: AgentTool[] = (session?.sources ?? []).map((source) => ({
    name: `search_${source.name}`,
    usage: `{"tool":"search_${source.name}","args":{"query":"..."}} searches ${source.label} and returns IDs, titles and snippets.`,
    args: z.object({ query: z.string() }).strict(),
    execute: async ({ query }: { query: string }) => {
      try {
        const hits = await source.search(query, session?.signal);
        session?.noteHits(hits.map((h) => h.id));
        if (!hits.length) return `No matching ${source.label} results.`;
        return hits.map((h) => `[${h.id}] ${h.title}\n${h.snippet}`).join("\n\n");
      } catch (error) {
        if (error instanceof SourceError) return session!.noteError(error.message);
        throw error;
      }
    },
    onRepeat: () => ({ hint: `Searching ${source.label} is no longer available: read one of the results with read.` }),
  }));
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
        const hits = index.search(query);
        if (!hits.length) return "No matching documents.";
        return hits.map((h) => `[${h.docId}] ${h.title}\n${h.snippet}`).join("\n\n");
      },
      onRepeat: () => ({ hint: "Searching is no longer available: read one of the documents it found with read." }),
    },
    {
      name: "read",
      usage: `{"tool":"read","args":{"docId":"..."}} returns the full text of a document.`,
      args: () => z.object({ docId: docId() }).strict(),
      execute: async ({ docId }: { docId: string }) => {
        if (session?.sourceFor(docId)) return session.read(docId);
        const doc = index.get(docId);
        if (!doc) {
          const parts = index.partsOf(docId);
          return parts.length
            ? `Document "${docId}" is long and split into parts: ${parts.join(", ")}. Read the part you need, or search to find it.`
            : `No document with ID "${docId}". Use an ID returned by search.`;
        }
        return `[${doc.id}] ${doc.title}\n${doc.text.slice(0, MAX_DOC_CHARS)}`;
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
    },
  ];
  // Without documents of the user's own, only the open sources can be searched.
  return [...(hasDocuments ? tools : tools.filter((t) => t.name !== "search")), ...sourceSearches].sort(
    (a, b) => Number(a.name === "final_answer") - Number(b.name === "final_answer"),
  );
}

