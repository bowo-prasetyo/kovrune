// Research tasks over PDF documents (docs/m1-plan.md, slice 2). They run on the
// base corpus plus the PDFs in eval/tasks/pdfs/, extracted with pdf.js exactly as
// the app extracts a user's PDF. The annual report is split into chunks.

import { extractPdfText, type PdfJsLike } from "../../src/documents/extract.ts";
import type { SourceDocument } from "../../src/tools/search.ts";
import { pdfSources } from "./pdf-sources.ts";
import type { ResearchTask } from "./research.ts";

export const pdfTasks: ResearchTask[] = [
  {
    id: "p01-tessel-income",
    kind: "lookup",
    question: "According to its 2024 annual report, what was the Tessel Foundation's total income in 2024?",
    answerable: true,
    facts: [["412,000", "412000", "412 000"]],
    citations: [["tessel-annual-report-2024"]],
  },
  {
    id: "p02-new-project",
    kind: "lookup",
    question: "Which new project did the Tessel Foundation accept in November 2024, and what does it do?",
    answerable: true,
    facts: [["Driftwood"], ["logging"]],
    citations: [["tessel-annual-report-2024"]],
  },
  {
    id: "p03-dictionary-size",
    kind: "lookup",
    question: "What dictionary size does the Brisk tuning guide recommend?",
    answerable: true,
    facts: [["112 KiB", "112KiB", "112 KB", "112K"]],
    citations: [["brisk-tuning-guide"]],
  },
  {
    id: "p04-audit-cost-and-reporter",
    kind: "multi-hop",
    question:
      "How much did the Tessel Foundation spend on security audits in 2024, and who reported the LumenDB security advisory published that year?",
    answerable: true,
    facts: [["96,000", "96000", "96 000"], ["Jonas Feld", "Feld"]],
    citations: [["tessel-annual-report-2024"], ["lumen-advisory-2024-07"]],
  },
];

/** Extracts the PDF documents; `readPdf` returns a PDF's bytes by document ID. */
export async function loadPdfDocuments(
  readPdf: (id: string) => Promise<Uint8Array>,
  pdfjs: PdfJsLike,
): Promise<SourceDocument[]> {
  return Promise.all(
    pdfSources.map(async (source) => {
      const { text, pageStarts } = await extractPdfText(await readPdf(source.id), pdfjs);
      return { id: source.id, title: source.title, text, pageStarts };
    }),
  );
}
