// Turns user files into plain text documents: text, Markdown, HTML and PDF.
// PDF extraction uses pdf.js; scanned PDFs without a text layer yield no text
// (there is no OCR, docs/m1-plan.md decision D3).

export type DocumentKind = "text" | "markdown" | "html" | "pdf";

export interface ExtractedDocument {
  kind: DocumentKind;
  text: string;
  pages?: number;
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

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

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

export async function extractPdfText(data: Uint8Array, pdfjs: PdfJsLike): Promise<{ text: string; pages: number }> {
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
      pages.push(page.replace(/[ \t]+/g, " ").trim());
    }
    return { text: pages.filter(Boolean).join("\n\n"), pages: pdf.numPages };
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
    const { text, pages } = await extractPdfText(bytes, await loadPdfJs());
    return {
      kind,
      text,
      pages,
      warning: text.trim() ? undefined : "No text found. This PDF may be scanned images; Kovrune cannot read text from images.",
    };
  }
  const raw = new TextDecoder().decode(bytes);
  const text = kind === "html" ? htmlToText(raw) : raw.replace(/\r\n/g, "\n").trim();
  return { kind, text, warning: text ? undefined : "This file has no text." };
}
