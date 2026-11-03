// A backup of what the user saved in this browser: documents and past answers (M2 slice 3).
// Downloaded models are not included, since they can be downloaded again, and neither is
// the setup, which belongs to the computer it was made on.
//
// A backup restores into any browser: into a new one, or into this one after the browser
// cleared the site's data. Restoring adds what is missing and never replaces anything.

import { z } from "zod";
import type { SavedAnswer } from "./answers.ts";
import { BACKUP_FORMAT, BACKUP_VERSION, type Backup } from "./backup-format.ts";
import { documentId, type LibraryDocument } from "./library.ts";
import { answerSchema, documentSchema } from "./records.ts";

export { BACKUP_FORMAT, BACKUP_VERSION, backupFileName, makeBackup, type Backup } from "./backup-format.ts";

/** Reads a backup file's text. Throws an error whose message can be shown to the user. */
export function parseBackup(text: string): Backup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("This file is not a Kovrune backup: it isn't valid JSON.");
  }
  const head = z.object({ format: z.literal(BACKUP_FORMAT), version: z.number() }).safeParse(value);
  if (!head.success) throw new Error("This file is not a Kovrune backup.");
  if (head.data.version > BACKUP_VERSION) {
    throw new Error("This backup was made by a newer version of Kovrune. Update the app, then restore it.");
  }
  const body = z
    .object({ exportedAt: z.string(), documents: z.array(documentSchema), answers: z.array(answerSchema) })
    .safeParse(value);
  if (!body.success) throw new Error("This backup is damaged: some of its documents or answers can't be read.");
  return {
    format: BACKUP_FORMAT,
    version: head.data.version,
    exportedAt: body.data.exportedAt,
    documents: body.data.documents,
    answers: body.data.answers as unknown as SavedAnswer[],
  };
}

export interface MergeResult {
  documents: LibraryDocument[];
  answers: SavedAnswer[];
  /** Records already here, counted but not added again. */
  skipped: number;
  /** Documents added under a new ID, because another document here already had theirs. */
  renamed: number;
}

/** What a backup adds to the saved records: everything not already here. Nothing here is replaced. */
export function mergeBackup(current: { documents: LibraryDocument[]; answers: SavedAnswer[] }, backup: Backup): MergeResult {
  const byId = new Map(current.documents.map((d) => [d.id, d]));
  const taken = new Set(byId.keys());
  const documents: LibraryDocument[] = [];
  let skipped = 0;
  let renamed = 0;
  for (const doc of backup.documents) {
    const here = byId.get(doc.id);
    if (here && here.text === doc.text) {
      skipped++;
      continue;
    }
    const id = here ? documentId(doc.fileName, taken) : doc.id;
    if (here) renamed++;
    taken.add(id);
    documents.push({ ...doc, id });
  }
  const answerIds = new Set(current.answers.map((a) => a.id));
  const answers: SavedAnswer[] = [];
  for (const answer of backup.answers) {
    if (answerIds.has(answer.id)) skipped++;
    else {
      answerIds.add(answer.id);
      answers.push(answer);
    }
  }
  return { documents, answers, skipped, renamed };
}

/** "Added 2 documents and 3 answers; 1 was already here." */
export function describeMerge(result: MergeResult): string {
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  const added =
    result.documents.length || result.answers.length
      ? `Added ${count(result.documents.length, "document")} and ${count(result.answers.length, "answer")}`
      : "Nothing new to add";
  const notes = [
    result.skipped ? `${result.skipped} ${result.skipped === 1 ? "was" : "were"} already here` : "",
    result.renamed ? `${count(result.renamed, "document")} with the same name as one here ${result.renamed === 1 ? "was" : "were"} added alongside it` : "",
  ].filter(Boolean);
  return `${added}${notes.length ? `; ${notes.join("; ")}` : ""}.`;
}
