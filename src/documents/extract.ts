// Turns user files into plain text documents: text, Markdown, HTML, PDF, and Word, PowerPoint,
// Excel and OpenDocument files. PDF extraction uses pdf.js; scanned PDFs without a text layer yield no
// text (there is no OCR, docs/m1-plan.md decision D3). Office files are read by office.ts.

import { extractOfficeText, joinPages, OFFICE_READER_VERSION, PAGE_UNITS, type OfficeKind } from "./office.ts";

export type DocumentKind = "text" | "markdown" | "html" | "pdf" | OfficeKind;

/** Every kind, for checking saved records (records.ts). */
export const DOCUMENT_KINDS = ["text", "markdown", "html", "pdf", "docx", "pptx", "xlsx", "odt", "odp", "ods"] as const satisfies readonly DocumentKind[];

const OFFICE_KINDS: ReadonlySet<string> = new Set<OfficeKind>(["docx", "pptx", "xlsx", "odt", "odp", "ods"]);

export function isOfficeKind(kind: string): kind is OfficeKind {
  return OFFICE_KINDS.has(kind);
}

/** Shown next to a document in the library. */
export const KIND_LABELS: Record<DocumentKind, string> = {
  pdf: "PDF",
  html: "HTML",
  markdown: "Markdown",
  text: "Text",
  docx: "Word",
  pptx: "PowerPoint",
  xlsx: "Excel",
  odt: "OpenDocument text",
  odp: "OpenDocument presentation",
  ods: "OpenDocument spreadsheet",
};

/** File extensions the app reads, for the file picker and error messages. */
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".pptx", ".xlsx", ".odt", ".odp", ".ods", ".txt", ".text", ".md", ".markdown", ".html", ".htm"];

/** What a document's pages are: slides in presentations, sheets in spreadsheets, pages otherwise. */
export function pageUnit(kind: DocumentKind | undefined): "page" | "slide" | "sheet" {
  return (kind && PAGE_UNITS[kind]) ?? "page";
}

export interface ExtractedDocument {
  kind: DocumentKind;
  text: string;
  pages?: number;
  /** PDFs, presentations and spreadsheets: where each page, slide or sheet starts in `text`, by its number minus one (see extractPdfText). */
  pageStarts?: number[];
  /** Shown to the user, e.g. when a PDF has no text layer. */
  warning?: string;
  /** Office files: the version of the reader that read it (office.ts OFFICE_READER_VERSION). */
  reader?: number;
}

/** Whether an Office document was read by an earlier version of the reader, which lost the columns of its tables. */
export function readByEarlierVersion(doc: { kind: DocumentKind; reader?: number }): boolean {
  return isOfficeKind(doc.kind) && (doc.reader ?? 1) < OFFICE_READER_VERSION;
}

export function detectKind(fileName: string, mimeType = ""): DocumentKind | undefined {
  const ext = fileName.toLowerCase().split(".").at(-1) ?? "";
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (ext === "html" || ext === "htm" || mimeType === "text/html") return "html";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "txt" || ext === "text" || mimeType === "text/plain") return "text";
  if (ext === "docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (ext === "pptx" || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (ext === "xlsx" || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (ext === "odt" || mimeType === "application/vnd.oasis.opendocument.text") return "odt";
  if (ext === "odp" || mimeType === "application/vnd.oasis.opendocument.presentation") return "odp";
  if (ext === "ods" || mimeType === "application/vnd.oasis.opendocument.spreadsheet") return "ods";
  return undefined;
}

/** Older Office formats, which Kovrune cannot read, and what to save them as instead. */
const LEGACY_FORMATS: Record<string, { name: string; saveAs: string }> = {
  doc: { name: "Word 97–2003 (.doc)", saveAs: ".docx" },
  ppt: { name: "PowerPoint 97–2003 (.ppt)", saveAs: ".pptx" },
  xls: { name: "Excel 97–2003 (.xls)", saveAs: ".xlsx" },
  rtf: { name: "Rich Text Format (.rtf)", saveAs: ".docx" },
};

function unsupportedMessage(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").at(-1) ?? "";
  const legacy = LEGACY_FORMATS[ext];
  if (legacy) {
    const app = ext === "xls" ? "Excel" : ext === "ppt" ? "PowerPoint" : "Word";
    const alternative = ext === "xls" ? "" : " or PDF";
    return `Kovrune cannot read ${legacy.name} files. Open ${fileName} in ${app} or LibreOffice, save it as ${legacy.saveAs}${alternative}, and add it again.`;
  }
  return `Unsupported file type: ${fileName}. Use PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), OpenDocument (.odt, .odp, .ods), text, Markdown or HTML files.`;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", shy: "\u00ad", nbsp: " " };

/** Readable text from HTML: drops scripts and styles, keeps block structure as line breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre|title)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === "#") {
        const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Joins a word broken across lines at a hyphen: "JSON-\nschema" becomes "JSON-schema", and a word
 * hyphenated by typesetting ("finan-\ncial") becomes "finan-cial". The hyphen stays because the
 * two cannot be told apart (PDFs made from Markdown break lines at compounds' own hyphens), and
 * quote matching ignores a hyphen between letters, so a quote of "financial" still verifies.
 * A soft hyphen marks typesetting only, so it is dropped, with its line break.
 */
export function joinHyphenatedLines(text: string): string {
  return text
    .replace(/(\p{L})-[ \t]*\n[ \t]*(?=\p{L})/gu, "$1-")
    .replace(/(\p{L})\u00ad[ \t]*\n[ \t]*(?=\p{L})/gu, "$1")
    .replace(/\u00ad/g, "");
}

/** The subset of pdf.js this module uses, so browser and Node builds can both be passed in. */
export interface PdfJsLike {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; verbosity?: number }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }> }>;
    }>;
    destroy(): Promise<void>;
  };
}

/**
 * The text of a PDF, its page count, and where each page starts in the text, so a quote can be
 * cited by page. `pageStarts[n - 1]` is page n's offset; a page without text starts where the
 * next page does, so the last page whose start is at or before an offset is the one it is on.
 */
export async function extractPdfText(
  data: Uint8Array,
  pdfjs: PdfJsLike,
): Promise<{ text: string; pages: number; pageStarts: number[] }> {
  // verbosity 0: errors only, so font warnings do not flood logs.
  const task = pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      let page = "";
      for (const item of content.items) {
        if (typeof item.str !== "string") continue;
        page += item.str;
        page += item.hasEOL ? "\n" : item.str && !item.str.endsWith(" ") ? " " : "";
      }
      pages.push(joinHyphenatedLines(page.replace(/[ \t]+/g, " ").trim()));
    }
    return { ...joinPages(pages), pages: pdf.numPages };
  } finally {
    await task.destroy();
  }
}

export async function extractText(
  file: { name: string; type?: string; arrayBuffer(): Promise<ArrayBuffer> },
  loadPdfJs: () => Promise<PdfJsLike>,
): Promise<ExtractedDocument> {
  const kind = detectKind(file.name, file.type);
  if (!kind) throw new Error(unsupportedMessage(file.name));
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === "pdf") {
    const { text, pages, pageStarts } = await extractPdfText(bytes, await loadPdfJs());
    return {
      kind,
      text,
      pages,
      pageStarts,
      warning: text.trim() ? undefined : "No text found. This PDF may be scanned images; Kovrune cannot read text from images.",
    };
  }
  if (isOfficeKind(kind)) {
    // Soft hyphens are already gone (office.ts, sheets.ts), so the slides' and sheets' offsets hold.
    const { text, pages, pageStarts, warning } = await extractOfficeText(bytes, kind);
    return {
      kind,
      text,
      reader: OFFICE_READER_VERSION,
      ...(pages !== undefined ? { pages } : {}),
      ...(pageStarts ? { pageStarts } : {}),
      warning: warning
        ? warning
        : text.trim()
        ? undefined
        : pageUnit(kind) === "slide"
          ? "No text found. The slides may hold only pictures; Kovrune cannot read text from images."
          : "This file has no text.",
    };
  }
  const raw = new TextDecoder().decode(bytes);
  const text = (kind === "html" ? htmlToText(raw) : raw.replace(/\r\n/g, "\n").trim()).replace(/\u00ad/g, "");
  return { kind, text, warning: text ? undefined : "This file has no text." };
}
