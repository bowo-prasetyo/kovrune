// What a saved document, answer or question in progress must hold to be shown: the fields the
// screens read. Backups are checked against these when restored (backup.ts), and records saved in this
// browser when they load (useSavedDocuments.ts, usePendingTask.ts), so a damaged record is set aside
// instead of crashing the page on every reload.

import { z } from "zod";
import { DOCUMENT_KINDS } from "../../documents/extract.ts";

export const documentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  text: z.string(),
  fileName: z.string(),
  kind: z.enum(DOCUMENT_KINDS),
  bytes: z.number().nonnegative(),
  pages: z.number().int().positive().optional(),
  pageStarts: z.array(z.number().int().nonnegative()).optional(),
  warning: z.string().optional(),
  reader: z.number().int().positive().optional(),
});

const supportSchema = z.looseObject({ sentences: z.array(z.looseObject({ text: z.string() })), judged: z.number(), backed: z.number() });
// A report's introduction or conclusion: its text and checked sentences.
const synthesisPart = z.looseObject({ text: z.string(), support: supportSchema });

// Answers are shown again exactly as saved; the checks cover what the result view reads.
const answerFields = {
  id: z.string().min(1),
  question: z.string(),
  askedAt: z.string(),
  model: z.string(),
  status: z.enum(["verified", "unverified", "not-found", "no-answer"]),
  answer: z.string().optional(),
  evidence: z.array(z.looseObject({ docId: z.string(), quote: z.string(), verified: z.boolean() })),
  support: supportSchema.optional(),
  citations: z.record(z.string(), z.looseObject({})),
  titles: z.record(z.string(), z.string()),
  sourceErrors: z.array(z.string()),
  noAnswer: z.string().optional(),
  steps: z.array(z.string()),
};
// A report's sections are answers too (docs/report-mode.md).
export const answerSchema = z.looseObject({
  ...answerFields,
  report: z
    .looseObject({
      title: z.string(),
      request: z.string(),
      plan: z.array(z.string()),
      sections: z.array(z.looseObject(answerFields)),
      unfinished: z.boolean().optional(),
      stopped: z.boolean().optional(),
      synthesis: z.looseObject({ introduction: synthesisPart, conclusion: synthesisPart }).optional(),
    })
    .optional(),
});

// The question in progress (tasks.ts): what the Interrupted notice and Continue read. Tasks saved
// before arXiv was a source have no "arxiv" preference, so the preferences are checked loosely.
export const taskSchema = z.looseObject({
  id: z.string(),
  question: z.string(),
  prefs: z.looseObject({}),
  documentIds: z.array(z.string()),
  setup: z.string(),
  calls: z.array(z.looseObject({ input: z.string(), output: z.string() })),
  steps: z.array(z.string()),
  startedAt: z.string(),
  updatedAt: z.string(),
  error: z.string().optional(),
});

/** Records as loaded, split into those that can be shown and those that can't. */
export interface Readable<T> {
  records: T[];
  /** Records that don't hold what the screens read; kept in the browser, not shown. */
  damaged: unknown[];
}

/** Splits loaded records by `schema`, keeping each readable record as it was saved. */
export function readable<T>(loaded: unknown[], schema: z.ZodType): Readable<T> {
  const records: T[] = [];
  const damaged: unknown[] = [];
  for (const record of loaded) {
    if (schema.safeParse(record).success) records.push(record as T);
    else damaged.push(record);
  }
  return { records, damaged };
}

const count = (n: number, noun: string) => `${n} saved ${noun}${n === 1 ? "" : "s"}`;

/** The notice above a list with damaged records: what is missing, and why it may be. */
export function describeDamaged(n: number, noun: "document" | "answer"): string {
  return `${count(n, noun)} can't be read, so ${n === 1 ? "it isn't" : "they aren't"} shown. ${n === 1 ? "It" : "They"} may have been damaged in the browser's storage, or saved by a newer version of Kovrune. Save ${n === 1 ? "it" : "them"} to a file to keep a copy or to report the problem.`;
}

/** The question before damaged records are deleted: unlike a removed answer, they have no undo. */
export function confirmDamagedDeletion(n: number, noun: "document" | "answer"): string {
  return `Delete ${count(n, noun)} that can't be read? This can't be undone; Save to a file keeps a copy first.`;
}

/** "kovrune-damaged-answers-2026-11-03.json" */
export function damagedFileName(noun: "document" | "answer", now = new Date()): string {
  return `kovrune-damaged-${noun}s-${now.toISOString().slice(0, 10)}.json`;
}
