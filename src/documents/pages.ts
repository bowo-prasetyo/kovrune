// Documents read as pages: PDF pages, slides, and spreadsheets' sheets.

/** One page, slide or sheet per string, joined by blank lines, with where each starts. */
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

/**
 * Letters and digits a page needs to count as having text. A page under it has none that Kovrune can read:
 * a scanned page, a full-page figure, or a blank page. A running header is read once, where it first
 * appears (pdf-layout.ts), so a scanned page keeps at most a page number; the shortest page of text in
 * the eval PDFs has far more than this.
 */
export const MIN_PAGE_CHARS = 25;

/** The pages, numbered from 1, whose text has fewer than MIN_PAGE_CHARS letters and digits. */
export function pagesWithoutText(text: string, pageStarts: number[] | undefined): number[] {
  if (!pageStarts?.length) return [];
  const empty: number[] = [];
  pageStarts.forEach((start, i) => {
    const page = text.slice(start, pageStarts[i + 1] ?? text.length);
    if ((page.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < MIN_PAGE_CHARS) empty.push(i + 1);
  });
  return empty;
}

/** "3, 7–9 and 12": page numbers as ranges, at most `limit` of them, then how many more. */
export function describePageNumbers(pages: number[], limit = 8): string {
  const ranges: string[] = [];
  for (let i = 0; i < pages.length; ) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j]! + 1) j++;
    ranges.push(i === j ? `${pages[i]}` : `${pages[i]}–${pages[j]}`);
    i = j + 1;
  }
  const shown = ranges.slice(0, limit);
  const more = ranges.length - shown.length;
  if (more) return `${shown.join(", ")} and ${more} more range${more === 1 ? "" : "s"}`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : (shown[0] ?? "");
}
