// Text from Word (.docx), PowerPoint (.pptx), OpenDocument text (.odt) and OpenDocument
// presentation (.odp) files: ZIP archives of XML (docs/office-formats.md). The text is what the
// reader sees, in reading order, because quotes are checked against it word for word:
// - Paragraphs are separated by a blank line, as in Markdown, so long documents split at them.
// - Table cells are separated by tabs and rows by line breaks; paragraphs inside a cell by spaces.
// - Deleted text in tracked changes, comments, field codes, and alternative copies of drawings
//   are left out. Footnotes and endnotes follow the text, under their own heading.
// - Each slide is a page, followed by its speaker notes, so quotes are cited by slide.
// Word and Writer files have no fixed pages (they depend on layout), so they get no page numbers.

import { openZip, isZip, ZipError, type ZipArchive } from "./zip.ts";
import { mainPart, relationships } from "./ooxml.ts";
import { joinPages } from "./pages.ts";
import { readOdsContent, readXlsx } from "./sheets.ts";
import { renderTable, type TableRow } from "./tables.ts";
import { walkXml, type XmlHandler } from "./xml.ts";

export type OfficeKind = "docx" | "pptx" | "xlsx" | "odt" | "odp" | "ods";

export { joinPages };

export interface OfficeText {
  text: string;
  /** Presentations and spreadsheets: the number of slides or sheets. */
  pages?: number;
  /** Presentations and spreadsheets: where each slide or sheet starts in `text`, by its number minus one. */
  pageStarts?: number[];
  /** Shown to the user, e.g. when a workbook is too large to read whole. */
  warning?: string;
}

/**
 * The version of this reader, saved with each document it reads, so a document read by an earlier
 * version can be pointed out: only its text is saved, so reading it again needs the file.
 * 1: tables lost their empty cells, and with them which column a value was in.
 * 2: tables keep their columns, with each value labelled by its column's header (tables.ts).
 */
export const OFFICE_READER_VERSION = 2;

/** What a kind's pages are, where they are not pages: slides in presentations, sheets in spreadsheets. */
export const PAGE_UNITS: Partial<Record<string, "slide" | "sheet">> = { pptx: "slide", odp: "slide", xlsx: "sheet", ods: "sheet" };

const FORMAT_NAMES: Record<OfficeKind, string> = {
  docx: "Word",
  pptx: "PowerPoint",
  xlsx: "Excel",
  odt: "OpenDocument text",
  odp: "OpenDocument presentation",
  ods: "OpenDocument spreadsheet",
};

const ODF_MIME: Record<"odt" | "odp" | "ods", string> = {
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
};

/** An OLE2 compound file: a pre-2007 Office file, or a password-protected Office 2007+ one. */
export function isCompoundFile(bytes: Uint8Array): boolean {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return bytes.length >= 8 && signature.every((byte, i) => bytes[i] === byte);
}

export async function extractOfficeText(bytes: Uint8Array, kind: OfficeKind): Promise<OfficeText> {
  const format = FORMAT_NAMES[kind];
  if (isCompoundFile(bytes)) {
    throw new Error(
      `This ${format} file is password-protected, or is an older format saved with a new name. ` +
        "Open it, remove the password or save it again as a new file, and add it again.",
    );
  }
  if (!isZip(bytes)) throw new Error(`This is not a ${format} file, or it is damaged.`);
  try {
    const zip = openZip(bytes);
    switch (kind) {
      case "docx":
        return await readDocx(zip);
      case "pptx":
        return await readPptx(zip);
      case "xlsx":
        return await readXlsx(zip);
      case "odt":
      case "odp":
      case "ods":
        return await readOdf(zip, kind);
    }
  } catch (error) {
    if (error instanceof ZipError) throw new Error(error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Building text

type Separator = "" | " " | "\t" | "\n" | "\n\n";
const STRENGTH: Record<Separator, number> = { "": 0, " ": 1, "\t": 2, "\n": 3, "\n\n": 4 };

/** Repeated cells (ODF's number-columns-repeated) beyond this are not written: they are empty padding. */
const MAX_REPEATED_CELLS = 64;

interface OpenTable {
  rows: TableRow[];
  row?: TableRow;
  /** The open cell's text, with how many grid columns it covers, how often it repeats, and how it is merged. */
  cell?: { builder: TextBuilder; span: number; repeat: number; continues: boolean; covered: boolean };
  /** Rows started now are header rows (inside ODF's table:table-header-rows). */
  inHeader: boolean;
}

/**
 * Collects text with separators between blocks. A separator is written only before the next text,
 * and the strongest one asked for wins, so empty paragraphs leave no runs of blank lines.
 *
 * Tables are collected as rows and cells, each cell in a builder of its own, and written whole when
 * they end (tables.ts). Text and table events go to the innermost open cell, so a table inside a
 * cell is written into that cell.
 */
class TextBuilder {
  private out = "";
  private pending: Separator = "";
  private tables: OpenTable[] = [];

  /** Paragraphs end with a space, not a blank line: a cell is written on one line. */
  private readonly inCell: boolean;

  constructor(inCell = false) {
    this.inCell = inCell;
  }

  /** The builder text goes to: the innermost open cell's, or this one. */
  private get writer(): TextBuilder {
    const cell = this.tables.at(-1)?.cell;
    return cell ? cell.builder.writer : this;
  }

  /** The builder whose table a row or cell event belongs to: the innermost one with a table open. */
  private get tableOwner(): TextBuilder {
    const inner = this.tables.at(-1)?.cell?.builder;
    return inner && inner.tables.length ? inner.tableOwner : this;
  }

  private get table(): OpenTable | undefined {
    return this.tableOwner.tables.at(-1);
  }

  add(text: string): void {
    const writer = this.writer;
    if (writer !== this) return writer.add(text);
    // Soft hyphens mark where a word may break, not text (extract.ts drops them from other files too).
    text = text.replace(/\u00ad/g, "");
    if (!text) return;
    if (this.out && this.pending) this.out += this.pending;
    this.pending = "";
    this.out += text;
  }

  separate(separator: Separator): void {
    const writer = this.writer;
    if (writer !== this) return writer.separate(separator);
    if (STRENGTH[separator] > STRENGTH[this.pending]) this.pending = separator;
  }

  endParagraph(): void {
    const writer = this.writer;
    writer.separate(writer.inCell ? " " : "\n\n");
  }

  startTable(): void {
    this.writer.tables.push({ rows: [], inHeader: false });
  }

  /** ODF's table:table-header-rows starts or ends. */
  headerRows(inside: boolean): void {
    const table = this.table;
    if (table) table.inHeader = inside;
  }

  startRow(): void {
    const table = this.table;
    if (!table) return;
    this.endRow();
    table.row = { cells: [], header: table.inHeader, skip: 0 };
  }

  /** The open row is a header (Word's tblHeader). */
  markHeaderRow(): void {
    const row = this.table?.row;
    if (row) row.header = true;
  }

  /** Empty grid columns before the open row's first cell (Word's gridBefore). */
  skipColumns(count: number): void {
    const row = this.table?.row;
    if (row && Number.isFinite(count) && count > 0) row.skip = Math.min(count, MAX_REPEATED_CELLS);
  }

  startCell(options: { span?: number; repeat?: number; continues?: boolean; covered?: boolean } = {}): void {
    const table = this.table;
    if (!table) return;
    if (!table.row) this.startRow();
    this.endCell();
    const whole = (n: number | undefined) => (n !== undefined && Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), MAX_REPEATED_CELLS) : 1);
    table.cell = {
      builder: new TextBuilder(true),
      span: whole(options.span),
      repeat: whole(options.repeat),
      continues: !!options.continues,
      covered: !!options.covered,
    };
  }

  /** The open cell is merged down from the row above (Word's vMerge, read after the cell starts). */
  continueCell(): void {
    const cell = this.table?.cell;
    if (cell) cell.continues = true;
  }

  /** How many grid columns the open cell covers (Word's gridSpan, read after the cell starts). */
  spanCell(span: number): void {
    const cell = this.table?.cell;
    if (cell && Number.isFinite(span) && span >= 1) cell.span = Math.min(Math.floor(span), MAX_REPEATED_CELLS);
  }

  endCell(): void {
    const table = this.table;
    const cell = table?.cell;
    if (!table || !cell) return;
    table.cell = undefined;
    // A cell is one line of its row, so its own line breaks and tabs are spaces.
    const text = cell.builder.toString().replace(/\s+/g, " ").trim();
    table.row ??= { cells: [], header: table.inHeader, skip: 0 };
    for (let n = 0; n < cell.repeat; n++) {
      table.row.cells.push({ text, span: cell.span, ...(cell.continues ? { continues: true } : {}), ...(cell.covered ? { covered: true } : {}) });
    }
  }

  endRow(): void {
    const table = this.table;
    if (!table?.row) return;
    this.endCell();
    table.rows.push(table.row);
    table.row = undefined;
  }

  endTable(): void {
    const owner = this.tableOwner;
    if (!owner.tables.length) return;
    owner.endRow();
    const table = owner.tables.pop()!;
    const text = renderTable(table.rows);
    // The table is a block of its own; written into a cell, it is one line there.
    owner.separate(owner.inCell ? " " : "\n\n");
    owner.add(text);
    owner.separate(owner.inCell ? " " : "\n\n");
  }

  toString(): string {
    // Tables left open by a damaged file are written as they are.
    while (this.tables.length) this.endTable();
    return tidy(this.out);
  }
}

/** Spaces around line breaks and runs of blank lines go; tabs between cells stay, empty cells' too. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ +\n/g, "\n")
    .replace(/\n +/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Notes after the text: "Footnotes", then "1. …" for each. */
function notesSection(heading: string, notes: string[]): string {
  const kept = notes.filter(Boolean);
  return kept.length ? `${heading}\n\n${kept.map((note, i) => `${i + 1}. ${note}`).join("\n\n")}` : "";
}

// ---------------------------------------------------------------------------------------------
// Office Open XML packages

// Elements whose content is never shown as text: formatting properties, alternative copies of
// drawings for older readers, and extensions.
// Table row and cell properties (w:trPr, w:tcPr) are read: they say which rows are headers and
// which cells span columns or are merged from above.
const OOXML_SKIP = new Set(["mc:Fallback", "w:pPr", "w:rPr", "w:sectPr", "w:tblPr", "w:tblGrid", "w:extLst", "a:extLst", "p:extLst"]);

/** An OOXML on/off value: absent or "true", "1" or "on" is on. */
const isOn = (value: string | undefined) => value === undefined || value === "true" || value === "1" || value === "on";

/** A WordprocessingML part (the document, footnotes or endnotes) as text. */
function wordprocessingText(xml: string, target: () => TextBuilder, onNote?: (start: boolean) => void): void {
  let inText = 0;
  walkXml(xml, {
    open(name, attr, selfClosing) {
      if (OOXML_SKIP.has(name)) return "skip";
      switch (name) {
        // Deleted and moved-away text in tracked changes; comments are in their own part.
        case "w:del":
        case "w:moveFrom":
          return "skip";
        case "w:footnote":
        case "w:endnote":
          // Separators between the text and the notes are notes too, with no text.
          if (attr("w:type") === "separator" || attr("w:type") === "continuationSeparator" || attr("w:type") === "continuationNotice") return "skip";
          if (!selfClosing) onNote?.(true);
          return;
        case "w:t":
          if (!selfClosing) inText++;
          return;
        case "w:tab":
        case "w:ptab":
          return void target().add("\t");
        case "w:br":
        case "w:cr":
          return void target().add("\n");
        case "w:noBreakHyphen":
          return void target().add("-");
        case "w:tbl":
          return void target().startTable();
        case "w:tr":
          return void target().startRow();
        case "w:tc":
          return void target().startCell();
        case "w:tblHeader":
          if (isOn(attr("w:val"))) target().markHeaderRow();
          return;
        case "w:gridBefore":
          return void target().skipColumns(Number(attr("w:val")));
        case "w:gridSpan":
          return void target().spanCell(Number(attr("w:val")));
        case "w:vMerge":
          // The first cell of a vertical merge says "restart"; the cells below it continue it.
          if (attr("w:val") !== "restart") target().continueCell();
          return;
      }
    },
    close(name) {
      switch (name) {
        case "w:t":
          inText--;
          return;
        case "w:p":
          return target().endParagraph();
        case "w:tc":
          return target().endCell();
        case "w:tr":
          return target().endRow();
        case "w:tbl":
          return target().endTable();
        case "w:footnote":
        case "w:endnote":
          return onNote?.(false);
      }
    },
    text(text) {
      if (inText > 0) target().add(text);
    },
  });
}

/** Footnotes or endnotes, each as one text. */
function wordprocessingNotes(xml: string): string[] {
  const notes: string[] = [];
  let note: TextBuilder | undefined;
  const scratch = new TextBuilder();
  wordprocessingText(
    xml,
    () => note ?? scratch,
    (start) => {
      if (start) note = new TextBuilder();
      else if (note) {
        notes.push(note.toString());
        note = undefined;
      }
    },
  );
  return notes;
}

async function readDocx(zip: ZipArchive): Promise<OfficeText> {
  const main = await mainPart(zip, "word/document.xml");
  const xml = await zip.text(main);
  if (xml === undefined) throw new Error("This Word file is damaged: it has no document part.");
  const body = new TextBuilder();
  wordprocessingText(xml, () => body);
  const rels = await relationships(zip, main);
  const sections = [body.toString()];
  for (const [type, heading] of [
    ["footnotes", "Footnotes"],
    ["endnotes", "Endnotes"],
  ] as const) {
    const part = rels.find((rel) => rel.type === type)?.target;
    const notes = part ? await zip.text(part) : undefined;
    if (notes) sections.push(notesSection(heading, wordprocessingNotes(notes)));
  }
  return { text: sections.filter(Boolean).join("\n\n") };
}

/** A DrawingML part (a slide or its notes) as text. */
function drawingText(xml: string): string {
  const builder = new TextBuilder();
  let inText = 0;
  // Per open table: whether its first row is a header (a:tblPr firstRow), and rows started so far.
  const tables: Array<{ firstRowHeader: boolean; rows: number }> = [];
  walkXml(xml, {
    open(name, attr, selfClosing) {
      if (OOXML_SKIP.has(name)) return "skip";
      switch (name) {
        // Fields hold slide numbers, dates and the like, not what the slide says.
        case "a:fld":
          return "skip";
        case "a:t":
          if (!selfClosing) inText++;
          return;
        case "a:br":
          return void builder.add("\n");
        case "a:tbl":
          tables.push({ firstRowHeader: false, rows: 0 });
          return void builder.startTable();
        case "a:tblPr": {
          const table = tables.at(-1);
          if (table) table.firstRowHeader = attr("firstRow") === "1" || attr("firstRow") === "true";
          return;
        }
        case "a:tr": {
          builder.startRow();
          const table = tables.at(-1);
          if (table && table.rows++ === 0 && table.firstRowHeader) builder.markHeaderRow();
          return;
        }
        case "a:tc": {
          // Cells covered by a merge are written too, empty, with hMerge or vMerge set.
          const on = (name: string) => attr(name) === "1" || attr(name) === "true";
          return void builder.startCell({ span: Number(attr("gridSpan") ?? 1), covered: on("hMerge"), continues: on("vMerge") });
        }
      }
    },
    close(name) {
      switch (name) {
        case "a:t":
          inText--;
          return;
        case "a:p":
          return builder.endParagraph();
        case "a:tc":
          return builder.endCell();
        case "a:tr":
          return builder.endRow();
        case "a:tbl":
          tables.pop();
          return builder.endTable();
      }
    },
    text(text) {
      if (inText > 0) builder.add(text);
    },
  });
  return builder.toString();
}

async function readPptx(zip: ZipArchive): Promise<OfficeText> {
  const main = await mainPart(zip, "ppt/presentation.xml");
  const xml = await zip.text(main);
  if (xml === undefined) throw new Error("This PowerPoint file is damaged: it has no presentation part.");
  // Slides in the order shown, which can differ from their part names after slides are moved.
  const ids: string[] = [];
  walkXml(xml, {
    open(name, attr) {
      if (name === "p:sldId") {
        const id = attr("r:id");
        if (id) ids.push(id);
      }
    },
  });
  const rels = await relationships(zip, main);
  const slides = ids.flatMap((id) => rels.find((rel) => rel.id === id && rel.type === "slide")?.target ?? []);
  const pages: string[] = [];
  for (const slide of slides) {
    const slideXml = await zip.text(slide);
    if (slideXml === undefined) continue;
    const notesPart = (await relationships(zip, slide)).find((rel) => rel.type === "notesSlide")?.target;
    const notesXml = notesPart ? await zip.text(notesPart) : undefined;
    pages.push(withNotes(drawingText(slideXml), notesXml ? drawingText(notesXml) : ""));
  }
  return { ...joinPages(pages), pages: pages.length };
}

function withNotes(slide: string, notes: string): string {
  return notes ? (slide ? `${slide}\n\nSpeaker notes:\n\n${notes}` : `Speaker notes:\n\n${notes}`) : slide;
}

// ---------------------------------------------------------------------------------------------
// OpenDocument

async function readOdf(zip: ZipArchive, kind: "odt" | "odp" | "ods"): Promise<OfficeText> {
  const format = FORMAT_NAMES[kind];
  const mime = (await zip.text("mimetype"))?.trim();
  if (mime && mime !== ODF_MIME[kind]) throw new Error(`This is not an ${format} file: it holds ${mime}.`);
  if ((await zip.text("META-INF/manifest.xml"))?.includes("encryption-data")) {
    throw new Error(`This ${format} file is password-protected. Open it, remove the password, save it, and add it again.`);
  }
  const xml = await zip.text("content.xml");
  if (xml === undefined) throw new Error(`This ${format} file is damaged: it has no content.`);
  return kind === "odt" ? odtText(xml) : kind === "odp" ? odpText(xml) : readOdsContent(xml);
}

/**
 * Reads OpenDocument text content. Character data in a paragraph counts, with runs of whitespace
 * read as one space, as ODF specifies; text:s, text:tab and text:line-break write spaces, tabs and
 * line breaks. Notes are written where `onNote` sends them, so they can follow the text.
 */
function odfHandler(target: () => TextBuilder, hooks: { open?: XmlHandler["open"]; close?: XmlHandler["close"] } = {}): XmlHandler {
  let paragraphs = 0;
  // Per open table: whether its first row is styled as a header (Impress), and rows started so far.
  const tables: Array<{ firstRowHeader: boolean; rows: number }> = [];
  return {
    open(name, attr, selfClosing) {
      const hooked = hooks.open?.(name, attr, selfClosing);
      if (hooked) return hooked;
      switch (name) {
        // Deleted text in tracked changes, comments, images' descriptions, and parts that hold no text.
        case "text:tracked-changes":
        case "office:annotation":
        case "svg:title":
        case "svg:desc":
        case "office:automatic-styles":
        case "office:font-face-decls":
        case "office:scripts":
        case "office:forms":
        case "text:note-citation":
          return "skip";
        case "text:p":
        case "text:h":
          if (!selfClosing) paragraphs++;
          else target().endParagraph();
          return;
        case "text:s":
          return void target().add(" ".repeat(Math.min(1000, Math.max(1, Number(attr("text:c") ?? 1) || 1))));
        case "text:tab":
          return void target().add("\t");
        case "text:line-break":
          return void target().add("\n");
        case "table:table":
          tables.push({ firstRowHeader: attr("table:use-first-row-styles") === "true", rows: 0 });
          return void target().startTable();
        case "table:table-header-rows":
          if (!selfClosing) target().headerRows(true);
          return;
        case "table:table-row": {
          if (selfClosing) return;
          target().startRow();
          const table = tables.at(-1);
          if (table && table.rows++ === 0 && table.firstRowHeader) target().markHeaderRow();
          return;
        }
        case "table:table-cell":
          target().startCell({
            span: Number(attr("table:number-columns-spanned") ?? 1),
            repeat: Number(attr("table:number-columns-repeated") ?? 1),
          });
          if (selfClosing) target().endCell();
          return;
        // A place a merge covers; anything in it is not shown (tables.ts).
        case "table:covered-table-cell":
          target().startCell({ covered: true, repeat: Number(attr("table:number-columns-repeated") ?? 1) });
          target().endCell();
          return "skip";
      }
    },
    close(name) {
      hooks.close?.(name);
      switch (name) {
        case "text:p":
        case "text:h":
          paragraphs--;
          return target().endParagraph();
        case "table:table-cell":
          return target().endCell();
        case "table:table-header-rows":
          return target().headerRows(false);
        case "table:table-row":
          return target().endRow();
        case "table:table":
          tables.pop();
          return target().endTable();
      }
    },
    text(text) {
      if (paragraphs > 0) target().add(text.replace(/[ \t\r\n]+/g, " "));
    },
  };
}

function odtText(xml: string): OfficeText {
  const body = new TextBuilder();
  const notes = { footnote: [] as string[], endnote: [] as string[] };
  let note: { builder: TextBuilder; kind: "footnote" | "endnote" } | undefined;
  walkXml(
    xml,
    odfHandler(() => note?.builder ?? body, {
      open(name, attr) {
        if (name === "text:note") note = { builder: new TextBuilder(), kind: attr("text:note-class") === "endnote" ? "endnote" : "footnote" };
      },
      close(name) {
        if (name === "text:note" && note) {
          notes[note.kind].push(note.builder.toString());
          note = undefined;
        }
      },
    }),
  );
  const sections = [body.toString(), notesSection("Footnotes", notes.footnote), notesSection("Endnotes", notes.endnote)];
  return { text: sections.filter(Boolean).join("\n\n") };
}

function odpText(xml: string): OfficeText {
  const pages: string[] = [];
  let slide: TextBuilder | undefined;
  let notes: TextBuilder | undefined;
  let inNotes = false;
  const scratch = new TextBuilder();
  walkXml(
    xml,
    odfHandler(() => (inNotes ? notes : slide) ?? scratch, {
      open(name) {
        if (name === "draw:page") {
          slide = new TextBuilder();
          notes = new TextBuilder();
        } else if (name === "presentation:notes") inNotes = true;
        else if (name === "draw:page-thumbnail") return "skip";
      },
      close(name) {
        if (name === "presentation:notes") inNotes = false;
        else if (name === "draw:page" && slide && notes) {
          pages.push(withNotes(slide.toString(), notes.toString()));
          slide = notes = undefined;
        }
      },
    }),
  );
  return { ...joinPages(pages), pages: pages.length };
}
