// Text from spreadsheets: Excel (.xlsx) and OpenDocument (.ods) workbooks
// (docs/office-formats.md#spreadsheets). Each sheet is a page, so quotes are cited by sheet.
//
// A sheet is written as its rows, each labelled with the header row's column names, as tables in
// documents are (tables.ts): "Sheet: Orders" then "Customer: Acme | Date: 2025-03-01 | Total: ¥1,500".
// Rows are what questions about a spreadsheet look up, so a long sheet is cut between rows, into
// blocks that each start with the sheet's name: a block read on its own still says which sheet and
// which columns its values are in.

import { builtInFormat, formatGeneral, formatValue } from "./number-format.ts";
import { mainPart, relationships } from "./ooxml.ts";
import { joinPages } from "./pages.ts";
import { textWeight } from "./scripts.ts";
import { tableLines, type TableCell, type TableRow } from "./tables.ts";
import { walkXml } from "./xml.ts";
import type { ZipArchive } from "./zip.ts";

/** Rows read from one workbook, all sheets together: enough for a large register, not a data dump. */
export const MAX_SHEET_ROWS = 20_000;
/** Columns read from a sheet; more are left out. */
export const MAX_SHEET_COLUMNS = 100;
/** A block of rows is at most this heavy (textWeight), so a block and its sheet line fit in one chunk (chunk.ts). */
const BLOCK_CHARS = 1400;

export interface SheetText {
  text: string;
  pages: number;
  pageStarts: number[];
  warning?: string;
}

interface Sheet {
  name: string;
  hidden: boolean;
  rows: TableRow[];
}

/** Counts rows and columns against the limits while sheets are read. */
class Budget {
  rows = 0;
  rowsCut = false;
  columnsCut = false;

  takeRow(): boolean {
    if (this.rows >= MAX_SHEET_ROWS) {
      this.rowsCut = true;
      return false;
    }
    this.rows++;
    return true;
  }

  warning(): string | undefined {
    const parts: string[] = [];
    if (this.rowsCut) parts.push(`only the first ${MAX_SHEET_ROWS.toLocaleString("en")} rows were read`);
    if (this.columnsCut) parts.push(`only the first ${MAX_SHEET_COLUMNS} columns of each sheet were read`);
    if (!parts.length) return undefined;
    const text = parts.join(", and ");
    return `This workbook is large: ${text}. Split it into smaller files to search the rest.`;
  }
}

// ---------------------------------------------------------------------------------------------
// Writing sheets

/** A cell that names a column: it has a letter in it and is short. */
const isName = (text: string) => /\p{L}/u.test(text) && text.length <= 60;

/**
 * A sheet's text. The header is the first row with two or more filled cells, if each of them names
 * a column; rows above it with a single cell (a title, a date) are written as they are.
 */
function sheetText(sheet: Sheet): string {
  const filled = (row: TableRow) => row.cells.filter((cell) => cell.text).length;
  const headerAt = sheet.rows.findIndex((row) => filled(row) >= 2);
  const title: string[] = [];
  let table = sheet.rows;
  if (headerAt > 0) {
    for (const row of sheet.rows.slice(0, headerAt)) {
      const text = row.cells.map((cell) => cell.text).filter(Boolean).join(" ");
      if (text) title.push(text);
    }
    table = sheet.rows.slice(headerAt);
  }
  if (headerAt >= 0 && table.length >= 2 && table[0]!.cells.every((cell) => !cell.text || isName(cell.text))) {
    table = [{ ...table[0]!, header: true }, ...table.slice(1)];
  }
  // A sheet with no row of two cells (a list in one column) has no header: its rows are written as they are.
  const { head, body } = tableLines(table);

  const label = `Sheet: ${sheet.name}${sheet.hidden ? " (hidden)" : ""}`;
  const blocks: string[] = [];
  let block = [label, ...title, ...head];
  let weight = block.reduce((sum, line) => sum + textWeight(line) + 1, 0);
  const firstBlockSize = block.length;
  for (const line of body) {
    const lineWeight = textWeight(line) + 1;
    if (block.length > firstBlockSize && weight + lineWeight > BLOCK_CHARS) {
      blocks.push(block.join("\n"));
      block = [label];
      weight = textWeight(label) + 1;
    }
    block.push(line);
    weight += lineWeight;
  }
  if (block.length > 1 || !blocks.length) blocks.push(block.join("\n"));
  // A sheet with nothing in it is still a page, so the sheet numbers stay those of the workbook.
  return blocks.length === 1 && block.length === 1 ? label : blocks.join("\n\n");
}

function workbookText(sheets: Sheet[], budget: Budget): SheetText {
  const pages = sheets.map(sheetText);
  const empty = sheets.every((sheet) => !sheet.rows.some((row) => row.cells.some((cell) => cell.text)));
  const warning = empty ? "This workbook has nothing in its cells." : budget.warning();
  return { ...joinPages(pages), pages: pages.length, ...(warning ? { warning } : {}) };
}

/** A cell's text on one line, as tables.ts writes cells, without soft hyphens (extract.ts drops them everywhere). */
const oneLine = (text: string) => text.replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------------------------
// Excel

/** "BC12" as a zero-based column and one-based row. */
function cellRef(ref: string): { column: number; row: number } | undefined {
  const match = /^([A-Z]{1,3})(\d+)$/.exec(ref.toUpperCase().replace(/\$/g, ""));
  if (!match) return undefined;
  let column = 0;
  for (const ch of match[1]!) column = column * 26 + (ch.charCodeAt(0) - 64);
  return { column: column - 1, row: Number(match[2]) };
}

/** Text of a shared string or an inline string: its runs, without the phonetic guide (Japanese furigana, rPh). */
function readStrings(xml: string): string[] {
  const strings: string[] = [];
  let current: string | undefined;
  let inText = 0;
  walkXml(xml, {
    open(name, _attr, selfClosing) {
      if (name === "x:si" || name === "si") {
        current = "";
        if (selfClosing) {
          strings.push("");
          current = undefined;
        }
      } else if (name === "x:rPh" || name === "rPh" || name === "x:phoneticPr" || name === "phoneticPr") return "skip";
      else if ((name === "x:t" || name === "t") && !selfClosing) inText++;
    },
    close(name) {
      if (name === "x:t" || name === "t") inText--;
      else if ((name === "x:si" || name === "si") && current !== undefined) {
        strings.push(current);
        current = undefined;
      }
    },
    text(text) {
      if (inText > 0 && current !== undefined) current += text;
    },
  });
  return strings;
}

interface Styles {
  /** The number format code of each cell style (cellXfs), by the style's index. */
  formats: Array<string | undefined>;
}

function readStyles(xml: string | undefined): Styles {
  const custom = new Map<number, string>();
  const formats: Array<string | undefined> = [];
  if (!xml) return { formats };
  let inCellXfs = 0;
  walkXml(xml, {
    open(name, attr, selfClosing) {
      const local = name.replace(/^x:/, "");
      if (local === "numFmt") {
        const id = Number(attr("numFmtId"));
        const code = attr("formatCode");
        if (Number.isFinite(id) && code !== undefined) custom.set(id, code);
      } else if (local === "cellXfs" && !selfClosing) inCellXfs++;
      else if (local === "xf" && inCellXfs > 0) {
        const id = Number(attr("numFmtId") ?? 0);
        formats.push(custom.get(id) ?? builtInFormat(id));
      }
    },
    close(name) {
      if (name.replace(/^x:/, "") === "cellXfs") inCellXfs--;
    },
  });
  return { formats };
}

/**
 * Reads an .xlsx workbook. Cells show what Excel shows: shared and inline text, numbers in their
 * number format, TRUE/FALSE, error codes, and for formulas the value Excel saved with the file.
 */
export async function readXlsx(zip: ZipArchive): Promise<SheetText> {
  const main = await mainPart(zip, "xl/workbook.xml");
  const workbook = await zip.text(main);
  if (workbook === undefined) throw new Error("This Excel file is damaged: it has no workbook part.");
  const rels = await relationships(zip, main);
  const part = (type: string) => rels.find((rel) => rel.type === type)?.target;
  const sharedPart = part("sharedStrings");
  const shared = sharedPart ? readStrings((await zip.text(sharedPart)) ?? "") : [];
  const stylesPart = part("styles");
  const styles = readStyles(stylesPart ? await zip.text(stylesPart) : undefined);

  let date1904 = false;
  const listed: Array<{ name: string; hidden: boolean; target?: string }> = [];
  walkXml(workbook, {
    open(name, attr) {
      const local = name.replace(/^x:/, "");
      if (local === "workbookPr") date1904 = attr("date1904") === "1" || attr("date1904") === "true";
      else if (local === "sheet") {
        const id = attr("r:id");
        const target = rels.find((rel) => rel.id === id && rel.type === "worksheet")?.target;
        const state = attr("state");
        // Chart sheets have no cells; they are left out.
        if (target) listed.push({ name: attr("name") ?? "Sheet", hidden: state === "hidden" || state === "veryHidden", target });
      }
    },
  });

  const budget = new Budget();
  const sheets: Sheet[] = [];
  for (const { name, hidden, target } of listed) {
    const xml = await zip.text(target!);
    sheets.push({ name, hidden, rows: xml ? xlsxRows(xml, shared, styles, date1904, budget) : [] });
  }
  return workbookText(sheets, budget);
}

function xlsxRows(xml: string, shared: string[], styles: Styles, date1904: boolean, budget: Budget): TableRow[] {
  // Rows by their number, each a map of column to text; merged ranges after.
  const grid = new Map<number, Map<number, string>>();
  const merges: Array<{ top: number; left: number; bottom: number; right: number }> = [];
  let rowNumber = 0;
  let row: Map<number, string> | undefined;
  let column = -1;
  let cell: { type?: string; style?: number; value?: string; inline?: string } | undefined;
  let reading: "v" | "t" | undefined;
  let inInline = 0;
  let inPhonetic = 0;

  walkXml(xml, {
    open(name, attr, selfClosing) {
      const local = name.replace(/^x:/, "");
      switch (local) {
        case "row": {
          const r = Number(attr("r"));
          rowNumber = Number.isFinite(r) && r > 0 ? r : rowNumber + 1;
          column = -1;
          row = undefined;
          if (!selfClosing && budget.rows < MAX_SHEET_ROWS) {
            row = new Map();
            grid.set(rowNumber, row);
          }
          return;
        }
        case "c": {
          const ref = attr("r") ? cellRef(attr("r")!) : undefined;
          column = ref ? ref.column : column + 1;
          cell = { type: attr("t"), style: attr("s") === undefined ? undefined : Number(attr("s")) };
          if (selfClosing) cell = undefined;
          return;
        }
        case "v":
          if (cell && !selfClosing) reading = "v";
          return;
        case "is":
          if (cell && !selfClosing) inInline++;
          return;
        case "rPh":
        case "phoneticPr":
          if (!selfClosing) inPhonetic++;
          return;
        case "t":
          if (cell && inInline > 0 && !selfClosing) reading = "t";
          return;
        case "mergeCell": {
          const [from, to] = (attr("ref") ?? "").split(":");
          const a = from ? cellRef(from) : undefined;
          const b = to ? cellRef(to) : a;
          if (a && b) merges.push({ top: a.row, left: a.column, bottom: b.row, right: b.column });
          return;
        }
      }
    },
    close(name) {
      const local = name.replace(/^x:/, "");
      if (local === "v" || local === "t") reading = undefined;
      else if (local === "is") inInline--;
      else if (local === "rPh" || local === "phoneticPr") inPhonetic--;
      else if (local === "c" && cell) {
        const text = oneLine(cellText(cell, shared, styles, date1904));
        if (text && row) {
          if (column < MAX_SHEET_COLUMNS) row.set(column, text);
          else budget.columnsCut = true;
        }
        cell = undefined;
      }
    },
    text(text) {
      if (!cell || !reading || inPhonetic > 0) return;
      if (reading === "v") cell.value = (cell.value ?? "") + text;
      else cell.inline = (cell.inline ?? "") + text;
    },
  });

  // Rows in order, cells by column, with merged ranges placed as tables.ts places them.
  const numbers = [...grid.keys()].sort((a, b) => a - b);
  const rows: TableRow[] = [];
  const index = new Map<number, number>();
  for (const number of numbers) {
    const cells = grid.get(number)!;
    if (!cells.size && !merges.some((m) => number > m.top && number <= m.bottom)) continue;
    if (!budget.takeRow()) break;
    const width = Math.max(-1, ...cells.keys()) + 1;
    index.set(number, rows.length);
    rows.push({ cells: Array.from({ length: width }, (_, c): TableCell => ({ text: cells.get(c) ?? "", span: 1 })), header: false, skip: 0 });
  }
  for (const merge of merges) {
    for (let r = merge.top; r <= merge.bottom; r++) {
      const at = index.get(r);
      if (at === undefined) continue;
      const cells = rows[at]!.cells;
      while (cells.length <= Math.min(merge.right, MAX_SHEET_COLUMNS - 1)) cells.push({ text: "", span: 1 });
      const first = cells[merge.left];
      if (!first) continue;
      first.span = Math.min(merge.right, MAX_SHEET_COLUMNS - 1) - merge.left + 1;
      if (r > merge.top) first.continues = true;
      for (let c = merge.left + 1; c <= Math.min(merge.right, MAX_SHEET_COLUMNS - 1); c++) cells[c] = { text: "", span: 1, covered: true };
    }
  }
  return rows;
}

function cellText(cell: { type?: string; style?: number; value?: string; inline?: string }, shared: string[], styles: Styles, date1904: boolean): string {
  const value = cell.value ?? "";
  switch (cell.type) {
    case "s":
      return shared[Number(value)] ?? "";
    case "inlineStr":
      return cell.inline ?? "";
    case "str":
      return value;
    case "b":
      return value === "1" || value === "true" ? "TRUE" : value === "" ? "" : "FALSE";
    // An error, as Excel shows it: #N/A, #DIV/0! and the like.
    case "e":
      return value;
    case "d":
      // An ISO date written as text (strict files): its date and time, as written.
      return value.replace("T", " ").replace(/(:\d\d)(\.\d+)?Z?$/, "$1").replace(/ 00:00:00$/, "");
  }
  if (value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  const format = cell.style !== undefined ? styles.formats[cell.style] : undefined;
  return format ? formatValue(number, format, date1904) : formatGeneral(number);
}

// ---------------------------------------------------------------------------------------------
// OpenDocument

/**
 * Reads the content of an .ods workbook. OpenDocument keeps each cell's text as shown (text:p), so
 * numbers and dates are written as LibreOffice shows them, with no formats to apply.
 */
export function readOdsContent(xml: string): SheetText {
  const budget = new Budget();
  const sheets: Sheet[] = [];
  const hiddenStyles = new Set<string>();
  let styleName: string | undefined;

  let sheet: Sheet | undefined;
  let row: TableRow | undefined;
  let rowRepeat = 1;
  let cell: { text: string; repeat: number; span: number; covered: boolean } | undefined;
  let paragraphs = 0;
  let paragraphCount = 0;

  const endCell = () => {
    if (!cell || !row) return;
    const text = oneLine(cell.text);
    const room = MAX_SHEET_COLUMNS - row.cells.length;
    // Runs of repeated empty cells fill a row out to 1,024 columns; only filled ones are kept.
    const repeat = Math.min(cell.repeat, Math.max(0, room));
    if (cell.repeat > room && text) budget.columnsCut = true;
    for (let n = 0; n < repeat; n++) {
      row.cells.push({ text, span: n === 0 ? cell.span : 1, ...(cell.covered ? { covered: true } : {}) });
    }
    cell = undefined;
  };

  walkXml(xml, {
    open(name, attr, selfClosing) {
      switch (name) {
        // Sheets hidden in LibreOffice have a table style with display="false".
        case "style:style":
          styleName = attr("style:name");
          return;
        case "style:table-properties":
          if (styleName && attr("table:display") === "false") hiddenStyles.add(styleName);
          return;
        case "office:annotation":
        case "text:note":
          return "skip";
        case "table:table":
          sheet = { name: attr("table:name") ?? "Sheet", hidden: hiddenStyles.has(attr("table:style-name") ?? ""), rows: [] };
          if (selfClosing) {
            sheets.push(sheet);
            sheet = undefined;
          }
          return;
        // A table inside a cell's drawing, or a named range's description: not the sheet's rows.
        case "table:named-expressions":
        case "office:forms":
        case "draw:frame":
          return "skip";
        case "table:table-row":
          rowRepeat = Math.max(1, Number(attr("table:number-rows-repeated") ?? 1) || 1);
          row = { cells: [], header: false, skip: 0 };
          if (selfClosing) row = undefined;
          return;
        case "table:table-cell":
        case "table:covered-table-cell":
          endCell();
          cell = {
            text: "",
            repeat: Math.max(1, Number(attr("table:number-columns-repeated") ?? 1) || 1),
            span: Math.max(1, Number(attr("table:number-columns-spanned") ?? 1) || 1),
            covered: name === "table:covered-table-cell",
          };
          paragraphCount = 0;
          if (selfClosing) endCell();
          return;
        case "text:p":
        case "text:h":
          if (!selfClosing && cell) {
            if (paragraphCount++ > 0) cell.text += " ";
            paragraphs++;
          }
          return;
        case "text:s":
          if (cell && paragraphs > 0) cell.text += " ".repeat(Math.min(100, Math.max(1, Number(attr("text:c") ?? 1) || 1)));
          return;
        case "text:tab":
        case "text:line-break":
          if (cell && paragraphs > 0) cell.text += " ";
          return;
      }
    },
    close(name) {
      switch (name) {
        case "style:style":
          styleName = undefined;
          return;
        case "text:p":
        case "text:h":
          if (cell && paragraphs > 0) paragraphs--;
          return;
        case "table:table-cell":
        case "table:covered-table-cell":
          endCell();
          return;
        case "table:table-row": {
          endCell();
          if (sheet && row) {
            const filled = row.cells.some((c) => c.text);
            // Runs of empty rows fill a sheet out to a million rows; a filled row repeated is written each time.
            const times = filled ? rowRepeat : 0;
            for (let n = 0; n < times; n++) {
              if (!budget.takeRow()) break;
              sheet.rows.push(n === 0 ? row : { ...row, cells: row.cells.map((c) => ({ ...c })) });
            }
            // An empty row in the middle still separates rows merged down across it.
          }
          row = undefined;
          return;
        }
        case "table:table":
          if (sheet) sheets.push(sheet);
          sheet = undefined;
          return;
      }
    },
    text(text) {
      if (cell && paragraphs > 0) cell.text += text.replace(/[ \t\r\n]+/g, " ");
    },
  });
  return workbookText(sheets, budget);
}
