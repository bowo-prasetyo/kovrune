// Research tools over a document index: search, read, and the final answer.

import { z } from "zod";
import type { AgentTool } from "../agent/agent.ts";
import type { EvidenceItem } from "../agent/evidence.ts";
import { parentId } from "../documents/chunk.ts";
import type { DocumentIndex } from "./search.ts";

export const RESEARCH_SYSTEM = `You are a research agent. Answer the user's question using only documents you find with the tools, not outside knowledge.
Search first, then read the documents you need. Some documents are outdated or corrected by later ones; prefer the most recent correction.
Finish with final_answer. For each document that supports the answer, give its ID and a short quote copied word for word from that document.
If the documents do not contain the answer, set "found" to false, say what is missing, and give no evidence. Never guess.`;

/** Documents longer than this are truncated when read, to fit small context windows. */
export const MAX_DOC_CHARS = 2400;

export interface ResearchFinal {
  found: boolean;
  answer: string;
  evidence: EvidenceItem[];
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
      onRepeat: () => ({ hint: "Searching is no longer available: read one of the documents it found with read." }),
    },
    {
      name: "read",
      usage: `{"tool":"read","args":{"docId":"..."}} returns the full text of a document.`,
      args: z.object({ docId: z.string() }).strict(),
      execute: async ({ docId }: { docId: string }) => {
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
        const others = index.partsOf(parentId(docId)).filter((id) => id !== docId);
        return others.length
          ? { hint: `This document has other parts: ${others.join(", ")}. Read another part, or search for something else.`, keepAfterRepeat: true }
          : { hint: "Search for something else, or read another document." };
      },
    },
    {
      name: "final_answer",
      usage: `{"tool":"final_answer","args":{"found":true,"answer":"...","evidence":[{"docId":"doc-id","quote":"words copied exactly from the document"}]}} finishes the task.`,
      args: z
        .object({
          found: z.boolean(),
          answer: z.string(),
          evidence: z.array(z.object({ docId: z.string(), quote: z.string() }).strict()),
        })
        .strict(),
    },
  ];
}

