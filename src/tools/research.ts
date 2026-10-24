// Research tools over a document index: search, read, and the final answer.

import { z } from "zod";
import type { AgentTool } from "../agent/agent.ts";
import type { DocumentIndex } from "./search.ts";

export const RESEARCH_SYSTEM = `You are a research agent. Answer the user's question using only documents you find with the tools, not outside knowledge.
Search first, then read the documents you need. Some documents are outdated or corrected by later ones; prefer the most recent correction.
Finish with final_answer. Cite the IDs of the documents that support the answer. If the documents do not contain the answer, set "found" to false.`;

/** Documents longer than this are truncated when read, to fit small context windows. */
export const MAX_DOC_CHARS = 2400;

export interface ResearchFinal {
  found: boolean;
  answer: string;
  citations: string[];
}

export function createResearchTools(index: DocumentIndex): AgentTool[] {
  return [
    {
      name: "search",
      usage: `{"tool":"search","args":{"query":"..."}} searches the documents and returns IDs, titles and snippets.`,
      args: z.object({ query: z.string() }).strict(),
      execute: async ({ query }: { query: string }) => {
        const hits = index.search(query);
        if (!hits.length) return "No matching documents.";
        return hits.map((h) => `[${h.docId}] ${h.title}\n${h.snippet}`).join("\n\n");
      },
    },
    {
      name: "read",
      usage: `{"tool":"read","args":{"docId":"..."}} returns the full text of a document.`,
      args: z.object({ docId: z.string() }).strict(),
      execute: async ({ docId }: { docId: string }) => {
        const doc = index.get(docId);
        if (!doc) return `No document with ID "${docId}". Use an ID returned by search.`;
        return `[${doc.id}] ${doc.title}\n${doc.text.slice(0, MAX_DOC_CHARS)}`;
      },
    },
    {
      name: "final_answer",
      usage: `{"tool":"final_answer","args":{"found":true,"answer":"...","citations":["doc-id"]}} finishes the task.`,
      args: z.object({ found: z.boolean(), answer: z.string(), citations: z.array(z.string()) }).strict(),
    },
  ];
}
