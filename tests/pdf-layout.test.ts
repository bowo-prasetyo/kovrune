import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { extractPdfText, type PdfJsLike } from "../src/documents/extract.ts";
import { pageLines, pageText, withoutRunningLines, type PdfTextItem } from "../src/documents/pdf-layout.ts";

/** A piece of text at (x, y), `width` wide and `height` tall, as pdf.js gives it. */
const at = (str: string, x: number, y: number, width: number, height = 10, hasEOL = false): PdfTextItem => ({ str, transform: [height, 0, 0, height, x, y], width, height, hasEOL });

describe("PDF pages read by layout (harness 0.68.0)", () => {
  it("joins a subscript, a superscript or a symbol set against the text before it, and spaces words apart", () => {
    const lines = pageLines([
      at("switching frequency is f", 50, 700, 100),
      at("sw", 150, 696, 8, 7.6),
      at(" ", 158, 696, 3, 0),
      at("= 65 kHz at 40 m", 161, 700, 70),
      at("Ω", 231, 700, 7),
      at("and", 245, 700, 15),
      at("−", 263, 700, 6),
      at("25 °C", 269, 700, 22, 10, true),
    ]);
    assert.deepEqual(lines.map((l) => l.text), ["switching frequency is fsw = 65 kHz at 40 mΩ and −25 °C"]);
    assert.equal(lines[0]!.y, 700, "a line's baseline is its tallest piece's, not its subscript's");
  });

  it("keeps the old spacing for pieces with no position", () => {
    assert.deepEqual(pageLines([{ str: "40 m" }, { str: "Ω", hasEOL: true }, { str: "next" }]).map((l) => l.text), ["40 m Ω", "next"]);
  });

  it("marks a paragraph at a wider gap, or an indent after a sentence, and not between a title's lines", () => {
    const line = (text: string, x: number, y: number, h = 10) => ({ text, x, y, h });
    const text = pageText([
      line("A Title In Large Type That", 100, 760, 17),
      line("Runs Over Two Lines", 150, 740, 17),
      line("The first paragraph starts here and", 50, 700),
      line("ends here.", 50, 688),
      line("The second is set apart by space and", 50, 670),
      line("ends here.", 50, 658),
      line("The third starts with an indent and", 62, 646),
      line("runs on into the next column without", 50, 634),
      line("ending its sentence", 300, 700),
    ]);
    assert.equal(
      text,
      "A Title In Large Type That\nRuns Over Two Lines\n\nThe first paragraph starts here and\nends here.\n\nThe second is set apart by space and\nends here.\n\nThe third starts with an indent and\nruns on into the next column without\nending its sentence",
    );
  });

  it("reads a running header or footer once, and drops page numbers", () => {
    const page = (n: number, body: string) => [
      { text: `IEEE TRANSACTIONS ON POWER ELECTRONICS, VOL. 41 ${n}`, y: 760, x: 50, h: 8 },
      { text: body, y: 700, x: 50, h: 10 },
      { text: `Page ${n} of 3`, y: 30, x: 50, h: 8 },
    ];
    const pages = withoutRunningLines([page(1, "First page."), page(2, "Second page."), page(3, "Third page.")]);
    assert.deepEqual(pages.map((p) => p.map((l) => l.text)), [["IEEE TRANSACTIONS ON POWER ELECTRONICS, VOL. 41 1", "First page."], ["Second page."], ["Third page."]]);
    // A line at the edge of fewer than 60% of the pages is the document's own.
    const once = withoutRunningLines([[{ text: "Results", y: 760 }, { text: "a", y: 700 }], [{ text: "b", y: 760 }], [{ text: "c", y: 760 }]]);
    assert.deepEqual(once.map((p) => p.map((l) => l.text)), [["Results", "a"], ["b"], ["c"]]);
  });

  it("reads the engineering suite's paper with its symbols whole, its paragraphs, and its header once", async () => {
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;
    const { text, pageStarts } = await extractPdfText(new Uint8Array(await readFile(new URL("../eval/engineering/docs/sic-pfc-paper.pdf", import.meta.url))), pdfjs);
    assert.match(text, /on-state resistance is RDS\(on\) = 40 mΩ at Tj = 25 °C/);
    assert.match(text, /switching frequency is fsw = 65 kHz/);
    assert.match(text, /range of −25 °C to 55 °C/);
    assert.match(text, /2\.5 × 10−6 A/);
    assert.match(text, /\n\nII\. CONVERTER DESIGN\n\n/, "a heading is a paragraph of its own");
    assert.equal(text.match(/IEEE TRANSACTIONS ON POWER ELECTRONICS/g)?.length, 1, "the running header, once");
    assert.equal(pageStarts.length, 2);
    assert.match(text.slice(pageStarts[1]), /^The proposed converter exceeds/, "page 2 starts with its text, not its header");
  });
});

describe("quotes of PDF text that sets symbols apart (harness 0.68.0)", () => {
  // Documents read before 0.68.0, and PDFs whose pieces do not touch, keep "− 25", "m Ω" and "× 10 −6".
  const source = "The device was tested from − 25 °C to 55 °C. RDS(on) is 40 m Ω typical. Leakage stayed below 2.5 × 10 −6 A.\n- 4 items";
  const verified = (quote: string) => checkEvidence([{ docId: "d", quote }], () => source)[0]!.verified;

  it("finds a quote typed whole of a minus sign, a unit prefix or an exponent set apart", () => {
    assert.equal(verified("tested from −25 °C to 55 °C"), true);
    assert.equal(verified("tested from -25 °C to 55 °C"), true);
    assert.equal(verified("RDS(on) is 40 mΩ typical"), true);
    assert.equal(verified("Leakage stayed below 2.5 × 10−6 A"), true);
    assert.equal(verified("tested from − 25 °C to 55 °C"), true, "and the text as it was read");
  });

  it("still tells a negative number from a positive one", () => {
    assert.equal(verified("tested from 25 °C to 55 °C"), false);
  });
});
