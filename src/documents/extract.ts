// Turns user files into plain text documents: text, Markdown, HTML and PDF.
// PDF extraction uses pdf.js; scanned PDFs without a text layer yield no text
// (there is no OCR, docs/m1-plan.md decision D3).

export type DocumentKind = "text" | "markdown" | "html" | "pdf";

export interface ExtractedDocument {
  kind: DocumentKind;
  text: string;
  pages?: number;
  /** PDFs: where each page starts in `text`, by page number minus one (see extractPdfText). */
  pageStarts?: number[];
  /** Shown to the user, e.g. when a PDF has no text layer. */
  warning?: string;
}

export function detectKind(fileName: string, mimeType = ""): DocumentKind | undefined {
  const ext = fileName.toLowerCase().split(".").at(-1) ?? "";
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (ext === "html" || ext === "htm" || mimeType === "text/html") return "html";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "txt" || ext === "text" || mimeType === "text/plain") return "text";
  return undefined;
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
    let text = "";
    const pageStarts: number[] = [];
    for (const page of pages) {
      if (page && text) text += "\n\n";
      pageStarts.push(text.length);
      text += page;
    }
    return { text, pages: pdf.numPages, pageStarts };
  } finally {
    await task.destroy();
  }
}

export async function extractText(
  file: { name: string; type?: string; arrayBuffer(): Promise<ArrayBuffer> },
  loadPdfJs: () => Promise<PdfJsLike>,
): Promise<ExtractedDocument> {
  const kind = detectKind(file.name, file.type);
  if (!kind) throw new Error(`Unsupported file type: ${file.name}. Use text, Markdown, HTML or PDF files.`);
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
  const raw = new TextDecoder().decode(bytes);
  const text = (kind === "html" ? htmlToText(raw) : raw.replace(/\r\n/g, "\n").trim()).replace(/\u00ad/g, "");
  return { kind, text, warning: text ? undefined : "This file has no text." };
}
