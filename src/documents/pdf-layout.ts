// A PDF page's text from the pieces pdf.js gives, using where each piece is on the page (harness 0.70.0).
//
// pdf.js gives a page as pieces of text, each with its position, width and height, in the order the PDF
// draws them. Until 0.70.0 they were joined with a space between every two and a line break where pdf.js
// marked one, and nothing else. That loses three things an engineering PDF depends on
// (eval/engineering/README.md):
// - a subscript, a superscript or a symbol from another font is its own piece, so "f<sub>sw</sub>" read as
//   "f sw", "40 mΩ" as "40 m Ω", "−25 °C" as "− 25 °C" and "10<sup>−6</sup>" as "10 − 6";
// - paragraphs were not marked, so a whole page was one paragraph, and chunking could not keep a
//   heading with what it introduces;
// - a running header or footer ("IEEE TRANSACTIONS ON …  2", "Page 2 of 3") was read into the text of
//   every page, between the last sentence of one page and the first of the next.
// Pieces without a position, or rotated or right-to-left ones, are joined as before.

/** The parts of a pdf.js text item this module reads. */
export interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
  /** [a, b, c, d, x, y]: the text matrix; x and y place the piece's baseline start on the page. */
  transform?: number[];
  width?: number;
  height?: number;
  dir?: string;
}

/** A line of a page: its text, and where it starts and how tall it is, when pdf.js says. */
export interface PdfLine {
  text: string;
  /** The x of its first piece with text. */
  x?: number;
  /** The baseline of its tallest piece, so a subscript does not move the line. */
  y?: number;
  /** The height of its tallest piece: the size of its text. */
  h?: number;
}

/**
 * Two pieces closer than this share of the text height are one word: a subscript, a superscript or a
 * symbol set right after the text before it. A space between words is a quarter of the height or more.
 */
const TOUCHING = 0.12;

/**
 * A superscript is raised by at least this share of its line's text height, and set at most `SMALLER`
 * of it (harness 0.91.0): reportlab and LaTeX raise an exponent by about half the height, at about 70%
 * of the size.
 */
const RAISED = 0.25;
const SMALLER = 0.9;
/** Digits and signs as superscripts: an exponent "10<sup>5</sup>" is "10⁵", not "105". */
const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "−": "⁻", "–": "⁻", "+": "⁺" };
const RAISABLE = /^[0-9+\-−–]+$/;
const raise = (text: string) => [...text].map((c) => SUPERSCRIPT[c] ?? c).join("");

/** Whether a piece is laid out left to right and not rotated, so its x and width can be compared. */
function upright(item: PdfTextItem): boolean {
  const t = item.transform;
  return Boolean(t && t.length >= 6 && t[1] === 0 && t[2] === 0 && item.dir !== "rtl" && item.width !== undefined);
}

/**
 * A page's lines. A line ends where pdf.js marks one (`hasEOL`). Within a line, a piece that starts
 * where the one before it ended is joined to it without a space; others are joined with one, as before.
 *
 * Since harness 0.91.0, a piece of digits and signs set raised and smaller than the text around it is a
 * superscript, written as one ("10⁵", "cm⁻³", "⁸⁷Rb"). Joined to the text before it, an exponent read as
 * part of its base: the physics suite's PDF gave "2.0 × 10<sup>5</sup> atoms" as "2.0 × 105 atoms". A
 * superscript before the text it belongs to ("<sup>87</sup>Rb") is found when that text follows.
 */
export function pageLines(items: PdfTextItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let line: PdfLine = { text: "" };
  // Where the previous piece ended, and how tall the text around it is; undefined when unknown.
  let end: number | undefined;
  let size = 0;
  // The baseline and height of the line's last piece set at the text's size, and the last piece itself.
  let base: { y: number; h: number } | undefined;
  let last: { y: number; h: number; text: string; raised: boolean } | undefined;
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const placed = upright(item);
    if (item.str) {
      const y = placed ? item.transform![5]! : undefined;
      const h = item.height ?? 0;
      const raisedAbove = (below: { y: number; h: number } | undefined) => y !== undefined && h > 0 && below !== undefined && y - below.y >= RAISED * below.h && h <= SMALLER * below.h;
      const raised = RAISABLE.test(item.str.trim()) && raisedAbove(base);
      // A superscript set before what it belongs to: the piece before this one, raised above it.
      if (!raised && last && !last.raised && y !== undefined && h > 0 && RAISABLE.test(last.text.trim()) && last.y - y >= RAISED * h && last.h <= SMALLER * h && line.text.endsWith(last.text)) {
        line.text = line.text.slice(0, -last.text.length) + raise(last.text);
        last.raised = true;
      }
      if (line.text && !/\s$/.test(line.text) && !/^\s/.test(item.str)) {
        const touching = placed && end !== undefined && Math.abs(item.transform![4]! - end) <= TOUCHING * Math.max(size, item.height ?? 0, 1);
        if (!touching) line.text += " ";
      }
      line.text += raised ? raise(item.str) : item.str;
      if (y !== undefined && item.str.trim() && h > 0) {
        if (!raised) base = { y, h };
        last = { y, h, text: item.str, raised };
      }
      if (placed && item.str.trim() && item.height) {
        line.x ??= item.transform![4];
        if (line.h === undefined || item.height > line.h) {
          line.h = item.height;
          line.y = item.transform![5];
        }
        size = Math.max(size, item.height);
      }
    }
    end = placed ? item.transform![4]! + item.width! : undefined;
    if (item.hasEOL) {
      lines.push(line);
      line = { text: "" };
      end = undefined;
      size = 0;
      base = undefined;
      last = undefined;
    }
  }
  lines.push(line);
  return lines.map((l) => ({ ...l, text: l.text.replace(/[ \t]+/g, " ").trim() })).filter((l) => l.text);
}

/** A line's text as compared across pages: digits as "#", so "Page 2 of 3" and "Page 3 of 3" are one line. */
function runningKey(text: string): string {
  return text.toLowerCase().replace(/\p{Nd}+/gu, "#").replace(/\s+/g, " ").trim();
}

/** A line that is only a page number: "2", "Page 2", "2 of 3", "2/3", "- 2 -". */
const PAGE_NUMBER = /^(?:page\s*)?#(?:\s*(?:of|\/)\s*#)?$|^[-–—]\s*#\s*[-–—]$/;

/** How many lines at the top and at the bottom of a page may be a running header or footer. */
const EDGE_LINES = 2;
/** The share of pages a line must stand at the edge of to be a running header or footer. */
const RUNNING_SHARE = 0.6;

/** A page's lines at its top and bottom: by position where every line has one, else by the order they are drawn. */
function edgeLines(lines: PdfLine[]): Set<PdfLine> {
  const ordered = lines.every((l) => l.y !== undefined) ? [...lines].sort((a, b) => b.y! - a.y!) : lines;
  return new Set([...ordered.slice(0, EDGE_LINES), ...ordered.slice(-EDGE_LINES)]);
}

/**
 * The pages without their running headers and footers: a line at the top or bottom of at least 60% of
 * the pages (two pages at least), compared with its digits as "#", is kept only where it first appears,
 * so a datasheet's "KV1200M040 Datasheet, Rev. 2.1" is read once. A line that is only a page number is
 * dropped from every page.
 */
export function withoutRunningLines(pages: PdfLine[][]): PdfLine[][] {
  const edges = pages.map(edgeLines);
  const counts = new Map<string, number>();
  for (const edge of edges) for (const key of new Set([...edge].map((l) => runningKey(l.text)))) counts.set(key, (counts.get(key) ?? 0) + 1);
  const withText = pages.filter((p) => p.length).length;
  const needed = Math.max(2, Math.ceil(RUNNING_SHARE * withText));
  const seen = new Set<string>();
  return pages.map((lines, i) =>
    lines.filter((line) => {
      if (!edges[i]!.has(line)) return true;
      const key = runningKey(line.text);
      if (PAGE_NUMBER.test(key)) return false;
      if ((counts.get(key) ?? 0) < needed) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

/** How much more than the usual line spacing a gap must be to end a paragraph. */
const PARAGRAPH_GAP = 1.3;
/** Lines are set at least this many text heights apart: a gap of up to 1.3 times that is a line's, not a paragraph's. */
const LEADING = 1.2;
/** A first-line indent is at least this many, and at most `MAX_INDENT`, text heights. */
const MIN_INDENT = 0.8;
const MAX_INDENT = 5;
/** A line that ends a sentence (or a heading's colon) may end a paragraph. */
const SENTENCE_END = /[.!?:;"”)\]]$/;

/** The usual spacing between a page's lines: the median of the gaps between neighbouring lines that look like running text. */
function lineSpacing(lines: PdfLine[]): number | undefined {
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [a, b] = [lines[i - 1]!, lines[i]!];
    if (a.y === undefined || b.y === undefined || !a.h) continue;
    const gap = a.y - b.y;
    if (gap > 0.5 * a.h && gap < 3 * a.h) gaps.push(gap);
  }
  if (!gaps.length) return undefined;
  gaps.sort((x, y) => x - y);
  return gaps[Math.floor(gaps.length / 2)];
}

/**
 * Whether a paragraph ends between two lines:
 * - the gap between them is more than 1.3 times the page's usual line spacing, as between paragraphs set
 *   apart and around headings;
 * - or the second starts indented from the first, by about one to five text heights, after a line that
 *   ends a sentence, as paragraphs set without space between them begin;
 * - or the text moves up the page, to the next column, after a line that ends a sentence: a sentence
 *   that runs on into the next column stays one paragraph.
 * The usual spacing is the page's, or 1.2 times the line's text height where that is more, so the lines
 * of a title in large type are not each a paragraph.
 */
function paragraphEnds(a: PdfLine, b: PdfLine, spacing: number | undefined): boolean {
  if (a.y === undefined || b.y === undefined || !a.h) return false;
  const gap = a.y - b.y;
  // Larger text, such as a title, is set with more space between its lines: that is not a paragraph's end.
  const usual = Math.max(spacing ?? 0, LEADING * a.h);
  if (gap < 0) return SENTENCE_END.test(a.text);
  if (gap > 3 * usual) return true;
  if (gap > PARAGRAPH_GAP * usual) return true;
  const ended = SENTENCE_END.test(a.text);
  if (a.x !== undefined && b.x !== undefined && ended) {
    const indent = b.x - a.x;
    if (indent >= MIN_INDENT * a.h && indent <= MAX_INDENT * a.h) return true;
  }
  return false;
}

/** Footnotes are set at most this share of the size of the text above them. */
const FOOTNOTE_SMALLER = 0.85;
/** Lines of one footnote block differ in size by at most this share. */
const FOOTNOTE_SIZES = 0.1;
/** A footnote starts with its number, raised or not, or a symbol and a space: "1 Putnam's …", "¹ See …", "* Corresponding". */
const FOOTNOTE_START = /^(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3}|\p{Nd}{1,3}[.)]?|[*†‡§])\s*\p{L}/u;
/** A page needs this many lines in larger type above its footnotes: a page set all in small type has none. */
const MIN_BODY_LINES = 2;

/**
 * Where a page's footnotes start, as an index into its lines; the number of lines when it has none (harness
 * 0.101.0). Footnotes are the page's last lines, set in one smaller size, below a line at least
 * 1/FOOTNOTE_SMALLER larger, from the first of them that starts as a footnote does (FOOTNOTE_START). A table
 * note ("Note: …", "*p < .05") does not start as one.
 */
export function footnotesAt(lines: PdfLine[]): number {
  const size = lines.at(-1)?.h;
  if (!size) return lines.length;
  let start = lines.length;
  while (start > 0) {
    const h = lines[start - 1]!.h;
    if (!h || Math.abs(h - size) > FOOTNOTE_SIZES * size) break;
    start--;
  }
  const above = lines[start - 1];
  if (!above?.h || size > FOOTNOTE_SMALLER * above.h) return lines.length;
  if (lines.slice(0, start).filter((l) => l.h && size <= FOOTNOTE_SMALLER * l.h).length < MIN_BODY_LINES) return lines.length;
  if (above.y !== undefined && lines.slice(start).some((l) => l.y !== undefined && l.y >= above.y!)) return lines.length;
  const first = lines.slice(start).findIndex((l) => FOOTNOTE_START.test(l.text));
  return first < 0 ? lines.length : start + first;
}

/**
 * The pages' texts (pageText), with footnotes moved out of a sentence they would cut (harness 0.101.0): when
 * a page's text ends mid-sentence above its footnotes, the footnotes are read after the paragraph that
 * finishes the sentence on the next page, rather than between its two halves. "… higher turnout among
 * homeowners² [footnotes] but not among renters" read the finding without its condition, and a quote of the
 * whole finding was not found (docs/social-sciences-audit.md, S3). Other pages read as before.
 */
export function pageTexts(pages: PdfLine[][]): string[] {
  let carried: string | undefined;
  const texts = pages.map((lines, i) => {
    const at = footnotesAt(lines);
    const body = lines.slice(0, at);
    const cut = at < lines.length && body.length > 0 && !SENTENCE_END.test(body.at(-1)!.text) && i + 1 < pages.length;
    let text = cut ? pageText(body) : pageText(lines);
    if (carried !== undefined) {
      const end = text.indexOf("\n\n");
      text = end < 0 ? `${text}\n\n${carried}` : `${text.slice(0, end)}\n\n${carried}${text.slice(end)}`;
      carried = undefined;
    }
    if (cut) carried = pageText(lines.slice(at));
    return text;
  });
  return texts;
}

/** A page's text from its lines: a line break between lines, a blank line where a paragraph ends. */
export function pageText(lines: PdfLine[]): string {
  const spacing = lineSpacing(lines);
  return lines.map((line, i) => (i === 0 ? line.text : `${paragraphEnds(lines[i - 1]!, line, spacing) ? "\n\n" : "\n"}${line.text}`)).join("");
}
