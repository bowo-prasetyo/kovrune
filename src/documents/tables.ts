// Tables from Office and OpenDocument files, written as text a small model can read
// (docs/office-formats.md#tables).
//
// A table's meaning is often in which column a value is in: a report card marks "◯" under
// Excellent, Good or Needs Improvement. Tab-separated cells keep the columns, but a 4B model
// counting tabs back to a header gets it wrong. So when a table has a header row, each value is
// written with its column's header: "Perspective: Knowledge & Skills | Good: ◯". Without one,
// cells are separated by tabs, empty cells included, so values stay in their columns.

export interface TableCell {
  /** The cell's text on one line: its paragraphs, breaks and tabs are spaces. */
  text: string;
  /** Grid columns the cell covers. */
  span: number;
  /** The cell is part of a cell merged down from the row above, whose text it repeats. */
  continues?: boolean;
  /**
   * A placeholder for a place a merge covers (ODF's covered-table-cell, PowerPoint's hMerge). It is
   * dropped where the cell before it spans its column; otherwise it is under a cell merged down.
   */
  covered?: boolean;
}

export interface TableRow {
  cells: TableCell[];
  /** The file marks this row as a header (repeated on each page, or a slide table's first row). */
  header: boolean;
  /** Empty grid columns before the first cell (Word's gridBefore). */
  skip: number;
}

/** A header cell longer than this is a sentence, not a column name. */
const MAX_HEADER_CHARS = 60;

/**
 * Whether a first row no file marked is still a header: every cell filled, short, and not a
 * number or a sentence. Two-column tables are left alone: they are usually labels and values
 * ("Principal | Tomoko Yamafuji"), whose first row is data.
 */
function looksLikeHeader(row: string[], columns: number, rows: number): boolean {
  if (rows < 2 || columns < 3 || row.length < columns) return false;
  return row.every((cell) => cell !== "" && cell.length <= MAX_HEADER_CHARS && !/^[\d\s.,:%+-]+$/.test(cell) && !/[.!?。]$/.test(cell));
}

/**
 * Each row's cells placed in grid columns, with empty strings where nothing is. A cell merged down
 * from the row above repeats its text, so each row reads whole: a subject written once beside three
 * rows is the subject of each. A header cell spanning columns names each of them.
 */
function toGrid(rows: TableRow[]): string[][] {
  const grid: string[][] = [];
  for (const row of rows) {
    const line: string[] = new Array<string>(row.skip).fill("");
    let spanned = 0;
    for (const cell of row.cells) {
      if (cell.covered && spanned > 0) {
        spanned--;
        continue;
      }
      const above = grid.at(-1)?.[line.length] ?? "";
      line.push((cell.continues || cell.covered) && !cell.text ? above : cell.text);
      for (let n = 1; n < cell.span; n++) line.push(row.header ? cell.text : "");
      spanned = cell.span - 1;
    }
    grid.push(line);
  }
  for (const line of grid) while (line.length && line.at(-1) === "") line.pop();
  return grid;
}

export function renderTable(rows: TableRow[]): string {
  const { head, body } = tableLines(rows);
  return [...head, ...body].join("\n");
}

/**
 * A table's lines: its header rows, and one line per row below them, each labelled with the
 * header's column names when there is a header (empty rows are left out). Spreadsheets use the two
 * apart, to split a long sheet between rows (sheets.ts).
 */
export function tableLines(rows: TableRow[]): { head: string[]; body: string[] } {
  const grid = toGrid(rows);
  const columns = Math.max(0, ...grid.map((row) => row.length));
  let headerRows = 0;
  while (headerRows < rows.length && rows[headerRows]!.header) headerRows++;
  if (headerRows === 0 && grid[0] && looksLikeHeader(grid[0], columns, grid.length)) headerRows = 1;
  // A header that is every row is not one: nothing would be labelled with it.
  if (headerRows >= grid.length) headerRows = 0;

  if (headerRows === 0) return { head: [], body: grid.filter((row) => row.some(Boolean)).map((row) => row.join("\t")) };

  // Column names: the header rows' texts in each column, as in a header of two rows ("Grade" over "Term 1").
  const names = Array.from({ length: columns }, (_, column) => {
    const parts: string[] = [];
    for (const row of grid.slice(0, headerRows)) {
      const text = row[column] ?? "";
      if (text && parts.at(-1) !== text) parts.push(text);
    }
    return parts.join(" ");
  });
  const head: string[] = [];
  for (const row of grid.slice(0, headerRows)) {
    // A spanning header cell is in each of its columns, but written once.
    const cells = row.filter((text, column) => text && text !== row[column - 1]);
    if (cells.length) head.push(cells.join(" | "));
  }
  const body: string[] = [];
  for (const row of grid.slice(headerRows)) {
    const cells = row.flatMap((text, column) => {
      if (!text) return [];
      const name = names[column];
      return [name && name !== text ? `${name}: ${text}` : text];
    });
    if (cells.length) body.push(cells.join(" | "));
  }
  return { head, body };
}
