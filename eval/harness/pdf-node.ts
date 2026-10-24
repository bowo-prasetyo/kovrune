// Loads the pdf suite's library in Node.js, extracting the PDFs with pdf.js.

import { readFile } from "node:fs/promises";
import { ResearchLibrary } from "../../src/agent/research.ts";
import type { PdfJsLike } from "../../src/documents/extract.ts";
import { corpus } from "../tasks/corpus.ts";
import { loadPdfDocuments } from "../tasks/pdf.ts";

export async function loadNodePdfLibrary(): Promise<ResearchLibrary> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;
  const documents = await loadPdfDocuments(
    async (id) => new Uint8Array(await readFile(new URL(`../tasks/pdfs/${id}.pdf`, import.meta.url))),
    pdfjs,
  );
  return new ResearchLibrary([...corpus, ...documents]);
}
