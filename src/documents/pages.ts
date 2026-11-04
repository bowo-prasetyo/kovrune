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
