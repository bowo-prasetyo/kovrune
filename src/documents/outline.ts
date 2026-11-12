// A long document's outline: its parts with the headings and table captions they hold, so the model can
// tell where in a document a part is and read the one it needs (tools/research.ts).
//
// In the clinical suite's first runs (eval/clinical/README.md), Qwen3.5-4B read a trial's Discussion and
// the parts around it, and never its Findings (part 3), which give the risk ratio it was asked for (c06).
// Asked for a mean age that only Table 1 gives (c02, c05), the models read the abstract and answered "not
// found". Neither model could see which part held the Findings or the table: reading a long document gave
// only its part IDs.

import { isHeadingLike } from "./chunk.ts";
import { textWeight } from "./scripts.ts";

/** Documents split into fewer parts than this get no outline: their part IDs are enough. */
export const OUTLINE_MIN_PARTS = 4;
/** The headings kept for one part: its first ones, which say where it starts. */
const HEADINGS_PER_PART = 2;
/** The longest heading kept, in textWeight; longer ones are cut with "…". */
const HEADING_CHARS = 60;
/** The longest outline, in textWeight: about 150 tokens, a few percent of a 4,096-token context. */
export const OUTLINE_CHARS = 600;

/**
 * The headings of one part's text: Markdown headings, table captions ("**Table 1** Baseline …" in the
 * clinical documents, "Table 1." in others), and short heading-like paragraphs (chunk.ts isHeadingLike),
 * each as its first line.
 */
export function partHeadings(text: string): string[] {
  const headings: string[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const first = paragraph.trim().split("\n")[0]!.trim();
    if (!first) continue;
    const markdown = /^#{1,6}\s+(.+)$/.exec(first);
    const table = /^\*{0,2}(Table\s+\d+[A-Za-z]?)\.?\*{0,2}\.?\s*(.*)$/.exec(first);
    // A Setext heading: a line underlined by "===" or "---" (the MPL-2.0's "5. Termination").
    const lines = paragraph.trim().split("\n");
    const setext = lines.length >= 2 && /^\s*(=+|-+)\s*$/.test(lines[1]!) && lines[1]!.trim().length >= 3;
    let heading: string | undefined;
    if (markdown) heading = markdown[1];
    else if (setext) heading = first;
    else if (table) {
      const caption = table[2]!.replace(/^[\s:.*–—-]+/, "");
      heading = `${table[1]}${caption ? `: ${caption}` : ""}`;
    }
    // A table's rows are short lines too, not headings.
    else if (!paragraph.trim().includes("\n") && !first.startsWith("|") && isHeadingLike(first)) heading = first;
    if (!heading) continue;
    heading = heading.replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
    if (textWeight(heading) > HEADING_CHARS) heading = `${[...heading].slice(0, HEADING_CHARS).join("").trimEnd()}…`;
    if (heading && !headings.includes(heading)) headings.push(heading);
  }
  return headings;
}

/**
 * A document's outline from its parts, in order: "#1 Summary / Background; #3 Findings; #19 Table 1:
 * Baseline characteristics…", listing only parts that have headings, at most HEADINGS_PER_PART each, cut
 * at OUTLINE_CHARS. Undefined for documents in fewer than OUTLINE_MIN_PARTS parts, or with no headings.
 */
export function outlineOf(parts: Array<{ id: string; text: string }>): string | undefined {
  if (parts.length < OUTLINE_MIN_PARTS) return undefined;
  const entries: string[] = [];
  let weight = 0;
  for (const part of parts) {
    const headings = partHeadings(part.text).slice(0, HEADINGS_PER_PART);
    if (!headings.length) continue;
    const number = /#(\d+)$/.exec(part.id)?.[1] ?? part.id;
    const entry = `#${number} ${headings.join(" / ")}`;
    if (weight + textWeight(entry) + 2 > OUTLINE_CHARS) {
      entries.push("…");
      break;
    }
    entries.push(entry);
    weight += textWeight(entry) + 2;
  }
  return entries.length ? entries.join("; ") : undefined;
}
