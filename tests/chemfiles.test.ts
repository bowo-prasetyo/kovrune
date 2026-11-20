import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { hillFormula, readCif, readJcamp, readMolfile } from "../src/documents/chemfiles.ts";
import { detectKind, extractText, KIND_LABELS } from "../src/documents/extract.ts";

const fixture = (name: string) => readFileSync(new URL(`fixtures/chem/${name}`, import.meta.url), "utf8");
const file = (name: string) => ({ name, arrayBuffer: async () => new TextEncoder().encode(fixture(name)).buffer as ArrayBuffer });
const noPdf = async () => {
  throw new Error("no PDF here");
};

describe("chemistry files (harness 0.99.0)", () => {
  it("reads a CIF's items and loops, leaving out unknown values", () => {
    const { text, warning } = readCif(fixture("sample.cif"));
    assert.equal(warning, undefined);
    for (const line of [
      "# data_compound_1",
      "chemical name systematic: 4-Nitrobenzoic acid",
      "chemical formula sum: C7 H5 N O4",
      "space group name H-M alt: P 21/c",
      "cell length a: 3.7155(4)",
      "cell angle beta: 91.674(4)",
      "exptl crystal colour: pale yellow",
      "refine ls R factor gt: 0.0412",
      "atom site:",
      "label: N1 | type symbol: N | fract x: -0.1230(4) | fract y: 0.6010(2) | fract z: 0.2101(1) | U iso or equiv: 0.019(1)",
      "label: C1 | type symbol: C | fract x: 0.3012(4) | fract y: 0.3301(2) | fract z: 0.0570(1)",
      "atom site label 1: O2 | atom site label 2: C1 | distance: 1.221(2)",
    ]) assert.ok(text.split("\n").includes(line), line);
    // "?" (unknown) says nothing.
    assert.ok(!text.includes("absorpt correction type"));
  });

  it("works out a molecule's formula with the hydrogens a drawing leaves out", () => {
    const ethanol = readMolfile(fixture("ethanol.mol")).text;
    assert.ok(ethanol.startsWith("# Ethanol\nFormula: C2H6O (worked out by Kovrune from the structure, with the hydrogens its atoms' valences leave)"));
    assert.ok(ethanol.includes("Molecular weight: 46.07 g/mol (worked out by Kovrune from the formula)"));
    assert.ok(ethanol.includes("Atoms drawn: 3; bonds: 2"));
  });

  it("reads each structure of an SD file with its data items: aromatic rings, sulfoxides and charges", () => {
    const { text, warning } = readMolfile(fixture("library.sdf"));
    assert.equal(warning, undefined);
    const blocks = text.split("\n\n");
    assert.equal(blocks.length, 3);
    assert.ok(blocks[0]!.startsWith("## benzene\nFormula: C6H6 "));
    assert.ok(blocks[0]!.includes("ID: CPD-001\nYield (%): 82"));
    assert.ok(blocks[1]!.startsWith("## dimethyl sulfoxide\nFormula: C2H6OS "));
    assert.ok(blocks[1]!.includes("Boiling point: 189 °C"));
    assert.ok(blocks[2]!.startsWith("## pyridinium\nFormula: C5H6N+ "));
  });

  it("reads a V3000 molfile, with its charges", () => {
    assert.ok(readMolfile(fixture("acetate-v3000.mol")).text.startsWith("# acetate\nFormula: C2H3O2− "));
  });

  it("writes formulas in Hill order", () => {
    assert.equal(hillFormula(new Map([["O", 1], ["C", 2], ["H", 6]])), "C2H6O");
    assert.equal(hillFormula(new Map([["Na", 1], ["Cl", 1]])), "ClNa");
  });

  it("says when a file has no structure it can read", () => {
    assert.equal(readMolfile("not a molfile\n").warning, "This file has no structure Kovrune can read.");
  });

  it("reads a spectrum's header and peak table, not its points", () => {
    const ir = readJcamp(fixture("ir.jdx")).text;
    for (const line of [
      "# 4-Nitrobenzoic acid, KBr pellet",
      "Data type: INFRARED SPECTRUM",
      "CAS registry number: 62-23-7",
      "X units: 1/CM",
      "Spectrum: 7 points from 4000 to 400 1/CM. The points are not written here; Kovrune reads a spectrum's header and peak table only.",
      "Peak table (4 peaks):",
      "X: 1695.2 | Y: 0.12",
      "X: 1347.0 | Y: 0.10",
    ]) assert.ok(ir.split("\n").includes(line), line);
    assert.ok(!ir.includes("912 910"));
    // A comment after "$$" is dropped.
    assert.ok(ir.includes("JCAMP-DX version: 4.24\n"));
    const nmr = readJcamp(fixture("h1.jdx")).text;
    assert.ok(nmr.includes("Observe frequency (MHz): 400.13"));
    assert.ok(nmr.includes("Solvent: CDCl3"));
    assert.ok(!nmr.includes("@AJ%J"));
  });

  it("is chosen by extension, and read when added", async () => {
    assert.equal(detectKind("structure.cif"), "cif");
    assert.equal(detectKind("library.SDF"), "molfile");
    assert.equal(detectKind("ethanol.mol"), "molfile");
    assert.equal(detectKind("ir.jdx"), "jcamp");
    assert.equal(detectKind("ir.dx"), "jcamp");
    assert.equal(detectKind("ir.jcamp"), "jcamp");
    assert.equal(KIND_LABELS.cif, "CIF");
    const doc = await extractText(file("sample.cif"), noPdf);
    assert.equal(doc.kind, "cif");
    assert.ok(doc.text.includes("cell length a: 3.7155(4)"));
    assert.equal((await extractText(file("library.sdf"), noPdf)).kind, "molfile");
    assert.equal((await extractText(file("ir.jdx"), noPdf)).kind, "jcamp");
  });
});
