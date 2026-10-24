// The user's documents for this session. They live in memory only; saving them
// between visits arrives in M2 (docs/m1-plan.md).

import { extractText, type DocumentKind } from "../../documents/extract.ts";
import { loadBrowserPdfJs } from "../../documents/pdf-browser.ts";

export interface LibraryDocument {
  id: string;
  title: string;
  text: string;
  fileName: string;
  kind: DocumentKind;
  bytes: number;
  pages?: number;
  warning?: string;
}

/** Accepted file types, for the file picker. */
export const ACCEPT = ".pdf,.txt,.text,.md,.markdown,.html,.htm";

/** A short, readable, unique document ID from a file name, e.g. "annual-report-2024". */
export function documentId(fileName: string, taken: Set<string>): string {
  const base =
    fileName
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "document";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export async function readDocument(file: File, taken: Set<string>): Promise<LibraryDocument> {
  const extracted = await extractText(file, loadBrowserPdfJs);
  return {
    id: documentId(file.name, taken),
    title: file.name,
    text: extracted.text,
    fileName: file.name,
    kind: extracted.kind,
    bytes: file.size,
    pages: extracted.pages,
    warning: extracted.warning,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
