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
import { walkXml, type XmlHandler } from "./xml.ts";

export type OfficeKind = "docx" | "pptx" | "odt" | "odp";

export interface OfficeText {
  text: string;
  /** Presentations: the number of slides. */
  pages?: number;
  /** Presentations: where each slide starts in `text`, by slide number minus one. */
  pageStarts?: number[];
}

/** Kinds whose pages are slides. */
export const SLIDE_KINDS: ReadonlySet<string> = new Set<OfficeKind>(["pptx", "odp"]);

const FORMAT_NAMES: Record<OfficeKind, string> = {
  docx: "Word",
  pptx: "PowerPoint",
  odt: "OpenDocument text",
  odp: "OpenDocument presentation",
};

const ODF_MIME: Record<"odt" | "odp", string> = {
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
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
      case "odt":
      case "odp":
        return await readOdf(zip, kind);
    }
  } catch (error) {
    if (error instanceof ZipError) throw new Error(error.message);
    throw error;
  }
}

/** One slide or document per string, joined by blank lines, with where each starts. */
export function joinPages(pages: string[]): { text: string; pageStarts: number[] } {
  let text = "";
  const pageStarts: number[] = [];
  for (const page of pages) {
    if (page && text) text += "\n\n";
    pageStarts.push(text.length);
    text += page;
  }
  return { text, pageStarts };
}

// ---------------------------------------------------------------------------------------------
// Building text

type Separator = "" | " " | "\t" | "\n" | "\n\n";
const STRENGTH: Record<Separator, number> = { "": 0, " ": 1, "\t": 2, "\n": 3, "\n\n": 4 };

/**
 * Collects text with separators between blocks. A separator is written only before the next text,
 * and the strongest one asked for wins, so empty paragraphs and cells leave no runs of blank lines.
 */
class TextBuilder {
  private out = "";
  private pending: Separator = "";
  /** Open table cells: a paragraph ending inside one is followed by a space, not a blank line. */
  cells = 0;

  add(text: string): void {
    // Soft hyphens mark where a word may break, not text (extract.ts drops them from other files too).
    text = text.replace(/\u00ad/g, "");
    if (!text) return;
    if (this.out && this.pending) this.out += this.pending;
    this.pending = "";
    this.out += text;
  }

  separate(separator: Separator): void {
    if (STRENGTH[separator] > STRENGTH[this.pending]) this.pending = separator;
  }

  endParagraph(): void {
    this.separate(this.cells > 0 ? " " : "\n\n");
  }

  endCell(): void {
    this.cells = Math.max(0, this.cells - 1);
    this.separate(this.cells > 0 ? " " : "\t");
  }

  endRow(): void {
    this.separate(this.cells > 0 ? " " : "\n");
  }

  endTable(): void {
    this.separate(this.cells > 0 ? " " : "\n\n");
  }

  toString(): string {
    return tidy(this.out);
  }
}

/** Spaces around line breaks and runs of blank lines go; tabs between cells stay. */
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

interface Relationship {
  id: string;
  /** The last segment of the relationship type, e.g. "officeDocument" or "slide". */
  type: string;
  /** The target part's path in the archive. */
  target: string;
}

/** The relationships of a part (or of the package, for ""), from its .rels part. */
async function relationships(zip: ZipArchive, part: string): Promise<Relationship[]> {
  const slash = part.lastIndexOf("/");
  const folder = part.slice(0, slash + 1);
  const xml = await zip.text(`${folder}_rels/${part.slice(slash + 1)}.rels`);
  if (!xml) return [];
  const found: Relationship[] = [];
  walkXml(xml, {
    open(name, attr) {
      if (name !== "rel:Relationship" || attr("TargetMode") === "External") return;
      const id = attr("Id");
      const type = attr("Type")?.split("/").at(-1);
      const target = attr("Target");
      if (id && type && target) found.push({ id, type, target: resolvePath(folder, target) });
    },
  });
  return found;
}

/** A relationship target, relative to the source part's folder or absolute from the package root. */
function resolvePath(folder: string, target: string): string {
  const parts = (target.startsWith("/") ? target.slice(1) : folder + target).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part !== "." && part !== "") out.push(part);
  }
  return out.join("/");
}

async function mainPart(zip: ZipArchive, fallback: string): Promise<string> {
  const main = (await relationships(zip, "")).find((rel) => rel.type === "officeDocument")?.target;
  return main && zip.has(main) ? main : fallback;
}

// Elements whose content is never shown as text: formatting properties, alternative copies of
// drawings for older readers, and extensions.
const OOXML_SKIP = new Set(["mc:Fallback", "w:pPr", "w:rPr", "w:sectPr", "w:tblPr", "w:tblGrid", "w:trPr", "w:tcPr", "w:extLst", "a:extLst", "p:extLst"]);

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
        case "w:tc":
          if (!selfClosing) target().cells++;
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
  walkXml(xml, {
    open(name, _attr, selfClosing) {
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
        case "a:tc":
          if (!selfClosing) builder.cells++;
          return;
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

async function readOdf(zip: ZipArchive, kind: "odt" | "odp"): Promise<OfficeText> {
  const format = FORMAT_NAMES[kind];
  const mime = (await zip.text("mimetype"))?.trim();
  if (mime && mime !== ODF_MIME[kind]) throw new Error(`This is not an ${format} file: it holds ${mime}.`);
  if ((await zip.text("META-INF/manifest.xml"))?.includes("encryption-data")) {
    throw new Error(`This ${format} file is password-protected. Open it, remove the password, save it, and add it again.`);
  }
  const xml = await zip.text("content.xml");
  if (xml === undefined) throw new Error(`This ${format} file is damaged: it has no content.`);
  return kind === "odt" ? odtText(xml) : odpText(xml);
}

/**
 * Reads OpenDocument text content. Character data in a paragraph counts, with runs of whitespace
 * read as one space, as ODF specifies; text:s, text:tab and text:line-break write spaces, tabs and
 * line breaks. Notes are written where `onNote` sends them, so they can follow the text.
 */
function odfHandler(target: () => TextBuilder, hooks: { open?: XmlHandler["open"]; close?: XmlHandler["close"] } = {}): XmlHandler {
  let paragraphs = 0;
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
        case "table:covered-table-cell":
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
        case "table:table-cell":
          if (!selfClosing) target().cells++;
          else target().separate("\t");
          return;
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
        case "table:table-row":
          return target().endRow();
        case "table:table":
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
