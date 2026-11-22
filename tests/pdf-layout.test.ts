import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { extractPdfText, type PdfJsLike } from "../src/documents/extract.ts";
import { pageLines, pageText, withoutRunningLines, type PdfTextItem } from "../src/documents/pdf-layout.ts";

/** A piece of text at (x, y), `width` wide and `height` tall, as pdf.js gives it. */
const at = (str: string, x: number, y: number, width: number, height = 10, hasEOL = false): PdfTextItem => ({ str, transform: [height, 0, 0, height, x, y], width, height, hasEOL });

describe("PDF pages read by layout (harness 0.70.0)", () => {
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
    // A raised exponent is a superscript (harness 0.91.0); a quote typed "10−6" still verifies (NFKC).
    assert.match(text, /2\.5 × 10⁻⁶ A/);
    assert.equal(checkEvidence([{ docId: "d", quote: "stayed below 2.5 × 10−6 A" }], () => text)[0]!.verified, true);
    assert.match(text, /\n\nII\. CONVERTER DESIGN\n\n/, "a heading is a paragraph of its own");
    assert.equal(text.match(/IEEE TRANSACTIONS ON POWER ELECTRONICS/g)?.length, 1, "the running header, once");
    assert.equal(pageStarts.length, 2);
    assert.match(text.slice(pageStarts[1]), /^The proposed converter exceeds/, "page 2 starts with its text, not its header");
  });
});

describe("quotes of PDF text that sets symbols apart (harness 0.70.0)", () => {
  // Documents read before 0.70.0, and PDFs whose pieces do not touch, keep "− 25", "m Ω" and "× 10 −6".
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

describe("superscripts in PDF text (harness 0.91.0)", () => {
  it("writes a raised exponent as a superscript, not as digits of its base", () => {
    const lines = pageLines([
      at("holds 2.0 × 10", 50, 700, 60),
      at("5", 110, 704.8, 4, 7.6),
      at(" atoms at 2.5 × 10", 114, 700, 70),
      at("14", 184, 704.8, 8, 7.6),
      at(" cm", 192, 700, 12),
      at("−", 204, 704.8, 4, 7.6),
      at("3", 208, 704.8, 4, 7.6, true),
    ]);
    assert.deepEqual(lines.map((l) => l.text), ["holds 2.0 × 10⁵ atoms at 2.5 × 10¹⁴ cm⁻³"]);
  });

  it("finds a superscript set before what it belongs to, and leaves subscripts and same-size digits alone", () => {
    const isotope = pageLines([at("condensates of ", 50, 700, 60), at("87", 110, 704.8, 8, 7.6), at("Rb atoms", 118, 700, 35, 10, true)]);
    assert.deepEqual(isotope.map((l) => l.text), ["condensates of ⁸⁷Rb atoms"]);
    const sub = pageLines([at("a = 100 a", 50, 700, 40), at("0", 90, 695.3, 4, 7.6), at(" here", 94, 700, 20, 10, true)]);
    assert.deepEqual(sub.map((l) => l.text), ["a = 100 a0 here"]);
    const cell = pageLines([at("Load 20%", 50, 700, 40), at("97.1%", 120, 700, 25, 10, true)]);
    assert.deepEqual(cell.map((l) => l.text), ["Load 20% 97.1%"]);
  });

  it("reads the physics suite's PDF with its powers of ten", async () => {
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;
    const { text } = await extractPdfText(new Uint8Array(await readFile(new URL("../eval/physics/docs/rb87-bec-paper.pdf", import.meta.url))), pdfjs);
    assert.match(text, /The final condensate\nholds 2\.0 × 10⁵ atoms\./);
    assert.match(text, /peak density of 2\.5 × 10¹⁴ cm⁻³/);
    assert.match(text, /pressure of 3 × 10⁻¹¹ mbar/);
    assert.match(text, /condensates of ⁸⁷Rb/);
    assert.doesNotMatch(text, /× 105/);
  });
});

describe("PDF tables keep their columns (harness 0.109.0)", () => {
  // A row of cells, each a piece at its x; widths as pdf.js gives them for 9-point text.
  const row = (y: number, cells: [string, number][]) => cells.map(([str, x], i) => at(str, x, y, str.length * 4.5, 9, i === cells.length - 1));
  const header: [string, number][] = [["Sample", 50], ["Density (%)", 110], ["HV (GPa)", 180], ["KIC (MPa m1/2)", 240], ["E (GPa)", 330]];

  it("writes a table's rows with '|' between cells, and an empty cell as '–' under its column (MS5)", () => {
    const lines = pageLines([
      at("Table 1. Properties.", 50, 600, 90, 9, true),
      ...row(580, header),
      ...row(565, [["Al2O3", 50], ["99.1", 110], ["", 0], ["4.1", 240], ["380", 330]].filter(([s]) => s) as [string, number][]),
      ...row(550, [["Al2O3-5SiC", 50], ["98.4", 110], ["21.3", 180], ["4.6", 240], ["402", 330]]),
      ...row(535, [["ZTA", 50], ["17.9", 180], ["6.8", 240]]),
      at("The toughness rose with zirconia.", 50, 510, 150, 9, true),
    ]);
    assert.deepEqual(
      lines.map((l) => l.text),
      [
        "Table 1. Properties.",
        "| Sample | Density (%) | HV (GPa) | KIC (MPa m1/2) | E (GPa) |",
        "| Al2O3 | 99.1 | – | 4.1 | 380 |",
        "| Al2O3-5SiC | 98.4 | 21.3 | 4.6 | 402 |",
        "| ZTA | – | 17.9 | 6.8 | – |",
        "The toughness rose with zirconia.",
      ],
    );
    assert.equal(pageText(lines), "Table 1. Properties.\n\n| Sample | Density (%) | HV (GPa) | KIC (MPa m1/2) | E (GPa) |\n| Al2O3 | 99.1 | – | 4.1 | 380 |\n| Al2O3-5SiC | 98.4 | 21.3 | 4.6 | 402 |\n| ZTA | – | 17.9 | 6.8 | – |\n\nThe toughness rose with zirconia.", "a table is a paragraph of its own");
  });

  it("writes a header over two columns as its cells, with nothing filled in", () => {
    const lines = pageLines([
      ...row(600, [["", 0], ["As-built", 110], ["HIP", 240]].filter(([s]) => s) as [string, number][]).map((p) => ({ ...p, width: 120 })),
      ...row(585, [["Sample", 50], ["YS", 110], ["UTS", 180], ["YS", 240], ["UTS", 300]]),
      ...row(570, [["V", 50], ["1105", 110], ["1220", 180], ["905", 240], ["995", 300]]),
      ...row(555, [["H", 50], ["1140", 110], ["1265", 180], ["915", 240], ["1010", 300]]),
    ]);
    assert.deepEqual(lines.map((l) => l.text), ["| As-built | HIP |", "| Sample | YS | UTS | YS | UTS |", "| V | 1105 | 1220 | 905 | 995 |", "| H | 1140 | 1265 | 915 | 1010 |"]);
  });

  it("leaves running text, two columns of text, and tables of two columns as they were", () => {
    const prose = pageLines([
      at("Grains coarsened above 900 °C, and the", 50, 700, 170, 9, true),
      at("hardness fell from 320 to 280 HV.", 50, 688, 150, 9, true),
    ]);
    assert.deepEqual(prose.map((l) => l.text), ["Grains coarsened above 900 °C, and the", "hardness fell from 320 to 280 HV."]);
    const twoColumns = pageLines([
      ...row(700, [["The alloy was cast and", 50], ["The coupons were then", 320]]),
      ...row(688, [["homogenized at 500 °C.", 50], ["tested at 240 °C.", 320]]),
      ...row(676, [["It was then aged.", 50], ["Their yield fell.", 320]]),
    ]);
    assert.deepEqual(twoColumns.map((l) => l.text), ["The alloy was cast and The coupons were then", "homogenized at 500 °C. tested at 240 °C.", "It was then aged. Their yield fell."]);
  });

  it("leaves a drawing set in columns, a directory tree, as it was", () => {
    const tree = pageLines([
      ...row(700, [["│", 50], ["├── app/", 70], ["UI: components, pages, state", 200]]),
      ...row(688, [["│", 50], ["├── agent/", 70], ["planner, executor, task graph", 200]]),
      ...row(676, [["│", 50], ["│", 70], ["webllm, wllama, local-endpoint", 200]]),
    ]);
    assert.deepEqual(tree.map((l) => l.text), ["│ ├── app/ UI: components, pages, state", "│ ├── agent/ planner, executor, task graph", "│ │ webllm, wllama, local-endpoint"]);
  });

  it("reads the materials suite's test report with its empty cells in place", async () => {
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;
    const { text } = await extractPdfText(new Uint8Array(await readFile(new URL("../eval/materials/docs/zta-test-report.pdf", import.meta.url))), pdfjs);
    assert.match(text, /^\| ZTA-10 \| 10 \| 99\.0 \| 17\.1 \| – \| 520 \|$/m);
    assert.match(text, /^\| ZTA-20 \| 20 \| 98\.6 \| – \| 5\.9 \| 610 \|$/m);
    assert.match(text, /^\| ZTA-30 \| 30 \| 97\.9 \| 15\.2 \| 6\.4 \| – \|$/m);
    // A quote of the row as it read before, or as a model types it, is still found.
    assert.equal(checkEvidence([{ docId: "r", quote: "ZTA-20 20 98.6 5.9 610" }], () => text)[0]!.verified, true);
  });
});
