// Recommendations 1–3 of the materials science audit (docs/materials-science-audit.md, harness 0.107.0): powers of
// ten and line breaks in Europe PMC's full texts (MS4), compound units and the field's units (MS3), and
// crystallographic notation in quotes and search (MS8).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkEvidence, locateQuote } from "../src/agent/evidence.ts";
import { numbers, sentenceSupport } from "../src/agent/support.ts";
import { readCif } from "../src/documents/chemfiles.ts";
import { barsAsMinus, crystallographic } from "../src/documents/crystallography.ts";
import { jatsToMarkdown, parseXml } from "../src/sources/jats.ts";
import { DocumentIndex } from "../src/tools/search.ts";

/** Which sentences are marked: "+" backed, "-" not backed, "." too short to judge. */
const marks = (quote: string, answer: string) =>
  sentenceSupport(answer, [{ docId: "d", quote, verified: true }], () => "Materials study")
    .sentences.map((s) => (s.backed === undefined ? "." : s.backed ? "+" : "-"))
    .join("");

const article = (body: string) =>
  `<article><front><journal-meta><journal-title>Materials</journal-title></journal-meta><article-meta><article-title>T</article-title><pub-date><year>2024</year></pub-date></article-meta></front><body>${body}</body></article>`;

describe("Europe PMC full texts: powers of ten and line breaks (MS4)", () => {
  // From PMC11547944 (medium-Mn steel), whose dislocation densities read "1.2855 × 1012 cm−2".
  const md = jatsToMarkdown(
    parseXml(
      article(
        `<p>The dislocation density of the tested steel heated at 1 °C/s is lowest, at 1.2855 × 10<sup>12</sup> cm<sup>−2</sup>, and the creep rate was 3.6 × 10<sup>−8</sup> s<sup>−1</sup>. BMI was 24.5 kg/m<sup>2</sup>; Fe<sup>3+</sup> was reduced; in 2010<sup>12</sup> it was not.</p>` +
          `<table-wrap><table><tr><td>2</td><td>560–558</td><td>Precipitation of Al-Si eutectic<break/>Precipitation of post-eutectic β-Al5FeSi phase</td></tr></table></table-wrap>`,
      ),
    ),
  );

  it("writes a power of ten in superscripts, and other superscripts as before", () => {
    assert.match(md, /1\.2855 × 10¹² cm−2/);
    assert.match(md, /3\.6 × 10⁻⁸ s−1/);
    assert.match(md, /24\.5 kg\/m2;/, "a unit's power is flattened as before, so the suites' documents keep their text");
    assert.match(md, /Fe3\+ was reduced/);
    assert.match(md, /in 201012 it was not/, "a year is no power's base");
  });

  it("reads a line break in a table cell as a space", () => {
    assert.match(md, /eutectic Precipitation of post-eutectic/);
  });

  it("backs the right power of ten, not the flattened one", () => {
    const quote = "the dislocation density of the tested steel heated at 1 °C/s is lowest, at 1.2855 × 10¹² cm−2";
    assert.equal(marks(quote, "The steel heated at 1 °C/s had the lowest dislocation density, 1.2855 × 10^12 cm−2."), "+");
    assert.equal(marks(quote, "The steel heated at 1 °C/s had the lowest dislocation density, 1.2855 × 10¹² cm⁻²."), "+");
    assert.equal(marks(quote, "The steel heated at 1 °C/s had the lowest dislocation density, 1.2855 × 10^14 cm−2."), "-");
    assert.equal(marks(quote, "The steel heated at 1 °C/s had the lowest dislocation density, 1.2855 × 1012 cm−2."), "-");
    const text = md;
    for (const written of ["at 1.2855 × 10¹² cm−2", "at 1.2855 × 1012 cm−2", "at 1.2855 × 10^12 cm−2", "at 1.2855 × 10^{12} cm−2"]) {
      assert.equal(checkEvidence([{ docId: "d", quote: written }], () => text)[0]!.verified, true, written);
    }
  });
});

describe("compound units and the field's units (MS3)", () => {
  // Each: the quote, a right sentence, a wrong one (docs/materials-science-audit.md, Appendix).
  const pairs: Array<[string, string, string]> = [
    ["The samples had a Vickers hardness of 320 HV after aging.", "The samples had a Vickers hardness of 320 HV after aging.", "The samples had a Brinell hardness of 320 HB after aging."],
    ["After tempering, the steel had a hardness of 52 HRC.", "After tempering, the steel reached a hardness of 52 HRC.", "After tempering, the steel reached a hardness of 52 HV."],
    ["The fracture toughness of the composite was 4.5 MPa·m^1/2.", "The composite had a fracture toughness of 4.5 MPa√m.", "The composite had a flexural strength of 4.5 MPa."],
    ["The NMC811 cathode delivered a specific capacity of 185 mAh g−1 at 0.1C.", "The NMC811 cathode delivered a specific capacity of 185 mAh/g at 0.1C.", "The NMC811 cathode delivered an areal capacity of 185 mAh per square centimetre at 0.1C."],
    ["The NMC811 cathode delivered a specific capacity of 185 mAh g−1 at 0.1C.", "The NMC811 cathode delivered 185 mAh per gram at 0.1C.", "The NMC811 cathode delivered 185 mAh g−1 at 1C."],
    ["The electrolyte reached an ionic conductivity of 1.2 mS cm−1 at 25 °C.", "The electrolyte reached an ionic conductivity of 1.2 mS/cm at 25 °C.", "The electrolyte reached an ionic conductivity of 1.2 S/cm at 25 °C."],
    ["The film resistivity was 5.2 μΩ cm.", "The film resistivity was 5.2 μΩ cm.", "The film resistivity was 5.2 mΩ cm."],
    ["The steel was irradiated to 10 dpa at 300 °C.", "The steel was irradiated to 10 dpa at 300 °C.", "The steel was irradiated to 10 Gy at 300 °C."],
    ["The Tafel slope of the catalyst was 45 mV dec−1.", "The Tafel slope of the catalyst was 45 mV/dec.", "The Tafel slope of the catalyst was 45 mV."],
    ["Samples were heated at 5 °C min−1 to 1400 °C.", "Samples were heated at 5 K min−1 to 1400 °C.", "Samples were heated at 10 K min−1 to 1400 °C."],
    ["The coating has a coefficient of thermal expansion of 8.6 × 10−6 K−1.", "The coating has a coefficient of thermal expansion of 8.6 ppm K−1.", "The coating has a coefficient of thermal expansion of 8.6 × 10−5 K−1."],
    ["Its thermal conductivity was 1.8 W/(m·K) at room temperature.", "Its thermal conductivity was 1.8 W m−1 K−1 at room temperature.", "Its thermal conductivity was 1.8 W m−2 K−1 at room temperature."],
    ["The nanoparticles had a saturation magnetization of 45 emu/g.", "The nanoparticles had a saturation magnetization of 45 emu g−1.", "The nanoparticles had a saturation magnetization of 45 emu per cubic centimetre."],
  ];

  for (const [quote, right, wrong] of pairs) {
    it(`backs "${right}" and not "${wrong}"`, () => {
      assert.equal(marks(quote, right), "+");
      assert.equal(marks(quote, wrong), "-");
    });
  }

  it("reads no power of a unit as a number, and leaves formulas, names and loads alone", () => {
    assert.deepEqual(numbers("185 mAh g−1 at 0.1C"), ["185", "0.1"]);
    assert.deepEqual(numbers("120 cm2 V−1 s−1"), ["120"]);
    assert.deepEqual(numbers("ZIF-8 and Ti-6Al-4V"), ["8", "6", "4"]);
    assert.deepEqual(numbers("5 mol% K2CO3"), ["5", "2", "3"]);
    assert.equal(marks("The coating had a hardness of 320 HV0.5.", "The coating had a hardness of 320 HV."), "+", "HV0.5 is a test load, not a power");
  });

  it("reads mS as millisiemens, not milliseconds", () => {
    assert.equal(marks("The pulse lasted 1.2 ms at 25 °C.", "The pulse lasted 1.2 mS at 25 °C."), "-");
    assert.equal(marks("The pulse lasted 1.2 ms at 25 °C.", "The pulse lasted 1.2 milliseconds at 25 °C."), "+");
  });

  it("does not read on past a unit into ordinary words", () => {
    assert.equal(marks("The films were annealed at 450 °C for 2 h in argon.", "The films were annealed at 450 °C for 2 h in argon."), "+");
    assert.equal(marks("The films were annealed at 450 °C for 2 h in argon.", "The films were annealed at 450 K for 2 h in argon."), "-");
    assert.equal(marks("Samples were dosed at 10 mg kg-1 for 2 h in water.", "Samples were dosed at 10 mg/kg for 2 h in water."), "+");
  });
});

describe("crystallographic notation (MS8)", () => {
  it("writes a barred digit as a minus and the digit, one character for one", () => {
    assert.equal(barsAsMinus("(1̄10) and Fm3̄m"), "(-110) and Fm-3m");
    assert.equal(barsAsMinus("(1̄10)").length, "(1̄10)".length);
  });

  it("runs spaced space-group symbols together, and leaves ordinary text alone", () => {
    assert.equal(crystallographic("space group F m -3 m, and P 63/m m c, or P 21/c"), "space group Fm-3m, and P63/mmc, or P21/c");
    assert.equal(crystallographic("Group P 1 and C 2 were compared; I am here."), "Group P 1 and C 2 were compared; I am here.");
  });

  it("finds a quote of a space group or a barred index however the source writes it", () => {
    const cif = readCif("data_NaCl\n_cell_length_a 5.6402(3)\n_symmetry_space_group_name_H-M 'F m -3 m'\n_space_group_IT_number 225\n").text;
    assert.ok(locateQuote("symmetry space group name H-M: Fm-3m", cif));
    assert.ok(locateQuote("symmetry space group name H-M: F m -3 m", cif));
    assert.ok(locateQuote("crystallizes in Fm-3m symmetry", "The phase crystallizes in Fm3̄m symmetry."));
    assert.ok(locateQuote("the (-110) surface was terminated by oxygen", "the (1̄10) surface was terminated by oxygen"));
    assert.equal(locateQuote("crystallizes in Pm-3m symmetry", "The phase crystallizes in Fm3̄m symmetry."), undefined);
  });

  it("finds a CIF by the space group as papers write it", () => {
    const cif = readCif("data_NaCl\n_symmetry_space_group_name_H-M 'F m -3 m'\n").text;
    const index = new DocumentIndex([
      { id: "nacl", title: "NaCl.cif", text: cif },
      { id: "steel", title: "Steel", text: "A paper about steel grains and fatigue in the Fm phase of nothing." },
      { id: "film", title: "Film", text: "The phase crystallizes in Fm3̄m symmetry after annealing." },
    ]);
    const found = (query: string) => index.search(query, 3).map((hit) => hit.docId);
    assert.ok(found("Fm-3m").includes("nacl"));
    assert.ok(found("Fm-3m").includes("film"));
    assert.ok(found("F m -3 m").includes("film"));
  });
});
