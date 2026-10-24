// Writes eval/tasks/pdfs/*.pdf from pdf-sources.ts:
//
//   node eval/tasks/make-pdfs.ts
//
// A small hand-written PDF writer (Helvetica, US Letter, ASCII text) keeps the
// files deterministic and avoids a PDF-generation dependency. The output is
// committed; tests extract it with pdf.js and check the facts are readable.

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pdfSources, type PdfSource } from "./pdf-sources.ts";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const FONT_SIZE = 11;
const LEADING = 16;
const TITLE_SIZE = 15;
const CHARS_PER_LINE = 80;
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LEADING);

function wrap(paragraph: string): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of paragraph.split(/\s+/)) {
    if (line && line.length + 1 + word.length > CHARS_PER_LINE) {
      lines.push(line);
      line = "";
    }
    line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function escape(text: string): string {
  if (/[^\x20-\x7e]/.test(text)) throw new Error(`Non-ASCII text is not supported: ${text}`);
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

/** Lines per page; an empty string is a blank line between paragraphs. */
function layout(source: PdfSource): string[][] {
  const lines = source.paragraphs.flatMap((p, i) => (i === 0 ? wrap(p) : ["", ...wrap(p)]));
  const pages: string[][] = [];
  const firstPageCapacity = LINES_PER_PAGE - 2; // the title takes two lines
  pages.push(lines.slice(0, firstPageCapacity));
  for (let i = firstPageCapacity; i < lines.length; i += LINES_PER_PAGE) pages.push(lines.slice(i, i + LINES_PER_PAGE));
  return pages;
}

function contentStream(lines: string[], title?: string): string {
  const ops = [`BT`, `${MARGIN} ${PAGE_HEIGHT - MARGIN} Td`];
  if (title) ops.push(`/F1 ${TITLE_SIZE} Tf`, `${LEADING * 2} TL`, `(${escape(title)}) Tj`, `T*`);
  ops.push(`/F1 ${FONT_SIZE} Tf`, `${LEADING} TL`);
  for (const line of lines) ops.push(line ? `(${escape(line)}) Tj T*` : `T*`);
  ops.push(`ET`);
  return ops.join("\n");
}

export function renderPdf(source: PdfSource): Buffer {
  const pages = layout(source);
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  pages.forEach((lines, i) => {
    const pageId = pageIds[i]!;
    const stream = contentStream(lines, i === 0 ? source.title : undefined);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf, "latin1");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

export const PDF_DIR = fileURLToPath(new URL("./pdfs/", import.meta.url));

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(PDF_DIR, { recursive: true });
  for (const source of pdfSources) {
    await writeFile(`${PDF_DIR}${source.id}.pdf`, renderPdf(source));
    console.log(`Wrote ${source.id}.pdf (${layout(source).length} pages)`);
  }
}
