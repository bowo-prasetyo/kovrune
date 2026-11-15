import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { extractText, textlessPagesWarning, type PdfJsLike } from "../src/documents/extract.ts";
import { describePageNumbers, MIN_PAGE_CHARS, pagesWithoutText } from "../src/documents/pages.ts";
import { describeImport } from "../src/app/research/import.ts";

const pdfjs = async () => (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;

describe("pages with no text", () => {
  it("finds the scanned and blank pages of a PDF, not the figure with a caption", async () => {
    // Page 2 is a scan with a printed page number, page 3 a figure and its caption, page 4 blank (tests/fixtures/pdf).
    const bytes = await readFile(new URL("./fixtures/pdf/scanned-pages.pdf", import.meta.url));
    const doc = await extractText({ name: "scanned-pages.pdf", arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, pdfjs);
    assert.equal(doc.pages, 5);
    assert.equal(doc.warning, undefined);
    assert.deepEqual(pagesWithoutText(doc.text, doc.pageStarts), [2, 4]);
    assert.equal(
      textlessPagesWarning(doc),
      "Pages 2 and 4 of 5 have no text Kovrune can read: they may be scans, full-page figures or blank. A question about what they show will find nothing.",
    );
  });

  it("counts letters and digits, so a page number or stray marks are not text", () => {
    const pages = ["Page one has a sentence of ordinary text in it.", "17", "— · —", "x".repeat(MIN_PAGE_CHARS)];
    const pageStarts: number[] = [];
    let text = "";
    for (const page of pages) {
      if (text) text += "\n\n";
      pageStarts.push(text.length);
      text += page;
    }
    assert.deepEqual(pagesWithoutText(text, pageStarts), [2, 3]);
    assert.deepEqual(pagesWithoutText(text, undefined), []);
    assert.equal(textlessPagesWarning({ kind: "pdf", text, pageStarts }), "Pages 2–3 of 4 have no text Kovrune can read: they may be scans, full-page figures or blank. A question about what they show will find nothing.");
  });

  it("warns only for a PDF with some text: a PDF with none has its own warning, and slides are not checked", () => {
    const one = { kind: "pdf" as const, text: "A page of text that is long enough to count.\n\n3", pageStarts: [0, 47] };
    assert.equal(textlessPagesWarning(one), "Page 2 of 2 has no text Kovrune can read: it may be a scan, a full-page figure or blank. A question about what it shows will find nothing.");
    assert.equal(textlessPagesWarning({ kind: "pdf", text: "", pageStarts: [0, 0] }), undefined);
    assert.equal(textlessPagesWarning({ kind: "pdf", text: "12\n\n13", pageStarts: [0, 4] }), undefined);
    assert.equal(textlessPagesWarning({ ...one, kind: "pptx" }), undefined);
    assert.equal(textlessPagesWarning({ kind: "pdf", text: "A page of text that is long enough to count.", pageStarts: [0] }), undefined);
  });

  it("lists pages as ranges", () => {
    assert.equal(describePageNumbers([3]), "3");
    assert.equal(describePageNumbers([3, 7, 8, 9]), "3 and 7–9");
    assert.equal(describePageNumbers([1, 3, 7, 8, 9, 12]), "1, 3, 7–9 and 12");
    assert.equal(describePageNumbers([1, 3, 5, 7, 9], 3), "1, 3, 5 and 2 more ranges");
  });

  it("counts them in an import's summary", () => {
    assert.equal(
      describeImport({ added: 12, withDetails: 9, duplicates: 0, unsupported: [], failed: 0, textless: 2, exports: 1, matchedExisting: 0 }),
      "Added 12 documents, 9 with paper details. Of these, 2 have pages with no text (probably scanned), marked below.",
    );
  });
});
