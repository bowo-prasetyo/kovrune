// Adding many documents at once: a folder, or many files, with a reference manager's export among them
// or added later (src/documents/references.ts). The planning and matching are here, apart from the
// screen (DocumentLibrary.tsx), so they can be tested.

import { ACCEPTED_EXTENSIONS } from "../../documents/extract.ts";
import { doiInText, isReferenceFile, matchReference, workFromEntry, type DocumentWork, type ReferenceEntry } from "../../documents/references.ts";
import type { LibraryDocument } from "./library.ts";

/** What a file is to the importer: its name, size, and path within a chosen folder, if any. */
export interface ImportFile {
  name: string;
  size: number;
  /** "Papers/2021/smith.pdf" for a file from a folder (File.webkitRelativePath, or the dropped entry's path). */
  path?: string;
}

export interface ImportPlan<F extends ImportFile> {
  /** Files to read as documents. */
  documents: F[];
  /** Reference exports to read for their entries. */
  references: F[];
  /** Files already in the library: the same name and size. */
  duplicates: F[];
  /** Files Kovrune can't read, by name. */
  unsupported: F[];
  /** Hidden files and those in hidden folders (".DS_Store", ".git/…"), left out without a word. */
  hidden: number;
}

const isHidden = (file: ImportFile) => (file.path ?? file.name).split("/").some((part) => part.startsWith(".") || part === "__MACOSX");

const extensionOf = (name: string) => name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";

/** Sorts the files of a folder or a drop: documents to read, exports to match, and what is left out. */
export function planImport<F extends ImportFile>(files: F[], existing: ReadonlyArray<Pick<LibraryDocument, "fileName" | "bytes">>): ImportPlan<F> {
  const plan: ImportPlan<F> = { documents: [], references: [], duplicates: [], unsupported: [], hidden: 0 };
  const have = new Set(existing.map((d) => `${d.fileName}\u0000${d.bytes}`));
  for (const file of files) {
    if (isHidden(file)) plan.hidden++;
    else if (isReferenceFile(file.name)) plan.references.push(file);
    else if (!ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))) plan.unsupported.push(file);
    else if (have.has(`${file.name}\u0000${file.size}`)) plan.duplicates.push(file);
    else {
      have.add(`${file.name}\u0000${file.size}`);
      plan.documents.push(file);
    }
  }
  return plan;
}

/**
 * A document's details: from the export entry that matches it, else the DOI it prints. Details from an
 * export replace any found otherwise; a DOI from the text never replaces details already there.
 */
export function workFor(doc: Pick<LibraryDocument, "fileName" | "text" | "pageStarts" | "work">, exports: Array<{ source: string; entries: ReferenceEntry[] }>): DocumentWork | undefined {
  for (const { source, entries } of exports) {
    const match = matchReference(doc, entries);
    if (match) return workFromEntry(match.entry, source);
  }
  if (doc.work) return doc.work;
  const doi = doiInText(doc.text, doc.pageStarts);
  return doi ? { authors: [], doi, from: "text" } : undefined;
}

/**
 * The library with each document matched against newly read exports: matched documents are replaced by
 * copies with their details (so the store saves them again), and the others kept as they are.
 */
export function withExports(docs: LibraryDocument[], exports: Array<{ source: string; entries: ReferenceEntry[] }>): { docs: LibraryDocument[]; matched: number } {
  let matched = 0;
  const updated = docs.map((doc) => {
    for (const { source, entries } of exports) {
      const match = matchReference(doc, entries);
      if (!match) continue;
      matched++;
      return { ...doc, work: workFromEntry(match.entry, source) };
    }
    return doc;
  });
  return { docs: updated, matched };
}

/** What a finished import says: added, with details, and what was left out and why. */
export function describeImport(result: {
  added: number;
  withDetails: number;
  duplicates: number;
  unsupported: string[];
  failed: number;
  /** Added PDFs with pages that have no text (extract.ts textlessPagesWarning). */
  textless?: number;
  exports: number;
  matchedExisting: number;
}): string {
  const parts: string[] = [];
  const s = (n: number) => (n === 1 ? "" : "s");
  if (result.added) parts.push(`Added ${result.added} document${s(result.added)}, ${result.withDetails} with paper details.`);
  if (result.textless) parts.push(`Of these, ${result.textless} ${result.textless === 1 ? "has" : "have"} pages with no text (probably scanned), marked below.`);
  if (result.exports && result.matchedExisting) parts.push(`Matched ${result.matchedExisting} document${s(result.matchedExisting)} already here to the reference export.`);
  else if (result.exports && !result.added) parts.push("No document here matched the reference export.");
  if (result.duplicates) parts.push(`Skipped ${result.duplicates} already in your documents.`);
  if (result.unsupported.length) {
    const shown = result.unsupported.slice(0, 3).join(", ");
    parts.push(`Skipped ${result.unsupported.length} file${s(result.unsupported.length)} Kovrune can't read (${shown}${result.unsupported.length > 3 ? ", …" : ""}).`);
  }
  if (result.failed) parts.push(`${result.failed} could not be read; see below.`);
  return parts.join(" ");
}

// --- Folders dropped on the page ---------------------------------------------------------------------

/** The browser's entry for a dropped file or folder (the File and Directory Entries API). */
interface Entry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (success: (file: File) => void, failure: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (success: (entries: Entry[]) => void, failure: (error: unknown) => void) => void };
}

/** A dropped file with its path inside the dropped folder. */
export type PathedFile = File & { importPath?: string };

/** Every file in a drop, with the files inside dropped folders and their subfolders. */
export async function filesFromDrop(transfer: DataTransfer): Promise<PathedFile[]> {
  const entries = [...transfer.items]
    .map((item) => (item.kind === "file" ? ((item as unknown as { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.() ?? null) : null))
    .filter((entry): entry is Entry => entry !== null);
  // Browsers without entries, or a drop of plain files only: the files as given.
  if (!entries.some((e) => e.isDirectory)) return [...transfer.files];
  const files: PathedFile[] = [];
  const walk = async (entry: Entry): Promise<void> => {
    if (entry.isFile && entry.file) {
      const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
      files.push(Object.assign(file, { importPath: entry.fullPath.replace(/^\//, "") }));
    } else if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      // readEntries returns a folder's entries in batches, until an empty one.
      for (;;) {
        const batch = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child);
      }
    }
  };
  for (const entry of entries) await walk(entry);
  return files;
}

/** The path of a file within a chosen or dropped folder. */
export function pathOf(file: File): string | undefined {
  return (file as PathedFile).importPath || file.webkitRelativePath || undefined;
}
