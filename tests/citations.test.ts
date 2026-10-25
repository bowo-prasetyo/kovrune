import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkEvidence, locateQuote, quoteContext } from "../src/agent/evidence.ts";
import { extractPdfText, type PdfJsLike } from "../src/documents/extract.ts";
import { describePages } from "../src/app/research/trace.ts";
import { loadNodePdfLibrary } from "../eval/harness/pdf-node.ts";

/** A pdf.js stand-in whose pages have the given texts. */
const fakePdf = (pages: string[]): PdfJsLike => ({
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: async (n: number) => ({ getTextContent: async () => ({ items: [{ str: pages[n - 1]! }] }) }),
    }),
    destroy: async () => {},
  }),
});

describe("PDF page offsets", () => {
  it("records where each page starts, with pages without text starting where the next one does", async () => {
    const { text, pages, pageStarts } = await extractPdfText(new Uint8Array(), fakePdf(["", "Page two text.", "", "Page four."]));
    assert.equal(text, "Page two text.\n\nPage four.");
    assert.equal(pages, 4);
    assert.deepEqual(pageStarts, [0, 0, 14, 16]);
    assert.deepEqual(quoteContext("Page two text", text, pageStarts)!.pages, { first: 2, last: 2 });
    assert.deepEqual(quoteContext("Page four", text, pageStarts)!.pages, { first: 4, last: 4 });
    // A quote across the page break names both pages.
    assert.deepEqual(quoteContext("text. Page four", text, pageStarts)!.pages, { first: 2, last: 4 });
  });

  it("cites the eval PDFs' quotes by page", async () => {
    const library = await loadNodePdfLibrary();
    const check = (docId: string, quote: string) =>
      checkEvidence([{ docId, quote }], (id) => library.textFor(id), (id) => library.pageStartsFor(id))[0]!;
    // The annual report has two pages and is split into chunks; quotes may cite a chunk.
    const report = library.documentFor("tessel-annual-report-2024")!;
    assert.equal(report.pageStarts?.length, 2);
    const chunk = library.index.partsOf("tessel-annual-report-2024")[0]!;
    const income = check(chunk, "Total income for 2024 was EUR 412,000.");
    assert.equal(income.verified, true);
    assert.deepEqual(income.context!.pages, { first: 1, last: 1 });
    const outlook = check("tessel-annual-report-2024", "The budget for 2025 assumes income of EUR 450,000.");
    assert.deepEqual(outlook.context!.pages, { first: 2, last: 2 });
    const brisk = check("brisk-tuning-guide", "train a dictionary first with brisk train");
    assert.deepEqual(brisk.context!.pages, { first: 1, last: 1 });
    // Documents that are not PDFs have context but no pages.
    const text = check("lumen-3-2-release", "LumenDB 3.2.0 was released in September 2024.");
    assert.equal(text.verified, true);
    assert.equal(text.context!.pages, undefined);
    assert.match(text.context!.passage, /^LumenDB 3\.2\.0 was released in September 2024\.$/);
  });
});

describe("quote context", () => {
  const ADA = readFileSync(new URL("./fixtures/ada-lovelace-lead.txt", import.meta.url), "utf8");

  it("finds the quote as written in the source, whatever the quote marks, case and list markers", () => {
    const slide = "Create a project\n– Using the creation wizard :\n• Select « New » > « Other ... »";
    const at = locateQuote("using the creation wizard: - Select \"New\"", slide)!;
    // The passage runs from the quote's first word to its last; the closing "»" has no letters.
    assert.equal(slide.slice(at.start, at.end), "Using the creation wizard :\n• Select « New");
    // A "[…]" at the edge of a snippet quote is skipped.
    assert.equal(slide.slice(...Object.values(locateQuote("[…] Create a project", slide)!)), "Create a project");
    assert.equal(locateQuote("not in the slide", slide), undefined);
  });

  it("shows the text around the quote, cut at whole words", () => {
    const context = quoteContext("She was the first to recognise the machine had applications beyond pure calculation.", ADA)!;
    assert.equal(context.passage, "She was the first to recognise the machine had applications beyond pure calculation.");
    assert.ok(context.before.endsWith("the analytical engine. "), context.before.slice(-40));
    assert.equal(context.more.before, true);
    assert.equal(context.more.after, true);
    assert.ok(context.before.length <= 240);
    // The context starts on a whole word of the article.
    assert.ok(ADA.includes(` ${context.before}`) || ADA.includes(`\n${context.before}`), context.before.slice(0, 20));
    assert.ok(context.after.length <= 240);
    // The context ends on a whole word of the article.
    const end = context.after.trimEnd();
    assert.ok(ADA.includes(`${end} `) || ADA.includes(`${end}\n`), end.slice(-20));
    assert.equal(context.pages, undefined);
  });

  it("is attached only to verified quotes", () => {
    const [real, invented] = checkEvidence(
      [
        { docId: "d", quote: "Lovelace is often considered the first computer programmer." },
        { docId: "d", quote: "Lovelace patented the analytical engine." },
      ],
      () => ADA,
    );
    assert.equal(real!.context?.passage, "Lovelace is often considered the first computer programmer.");
    assert.equal(invented!.context, undefined);
  });

  it("names one page or a range", () => {
    assert.equal(describePages({ first: 4, last: 4 }), "p. 4");
    assert.equal(describePages({ first: 3, last: 5 }), "pp. 3–5");
  });
});
