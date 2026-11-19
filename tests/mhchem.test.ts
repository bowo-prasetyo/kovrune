// Chemical formulas written with mhchem and chemformula, read as the PDF prints them (harness 0.93.0): before,
// the converter read "\ce{CO2}" as a cedilla on "e", "eCO2" (src/documents/mhchem.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { latexToText } from "../src/documents/latex.ts";
import { chemistryText, mhchemToText, physicalUnitText } from "../src/documents/mhchem.ts";

const convert = (body: string, preamble = "\\usepackage{mhchem}") =>
  latexToText(new Map([["main.tex", `\\documentclass{article}${preamble}\n\\begin{document}\n${body}\n\\end{document}`]]))?.text.trim();

describe("mhchem formulas", () => {
  it("writes counts as subscripts and charges as superscripts", () => {
    const cases: Array<[string, string]> = [
      ["CO2", "CO₂"],
      ["H2SO4", "H₂SO₄"],
      ["HCOO-", "HCOO⁻"],
      ["Na+", "Na⁺"],
      ["e-", "e⁻"],
      ["Fe^{3+}", "Fe³⁺"],
      ["Fe^3+", "Fe³⁺"],
      ["Fe3+", "Fe³⁺"],
      ["SO4^2-", "SO₄²⁻"],
      ["[Ru(bpy)3]^2+", "[Ru(bpy)₃]²⁺"],
      ["Pd(OAc)2", "Pd(OAc)₂"],
      ["CuSO4*5H2O", "CuSO₄·5H₂O"],
      ["^{13}C", "¹³C"],
      ["Fe^{II}", "Fe(II)"],
      ["H2O_{(l)}", "H₂O(l)"],
    ];
    for (const [input, written] of cases) assert.equal(chemistryText(input), written, input);
  });

  it("keeps coefficients, plus signs, arrows and their conditions", () => {
    assert.equal(chemistryText("N2 + 3H2 <=> 2NH3"), "N₂ + 3H₂ ⇌ 2NH₃");
    assert.equal(chemistryText("2H2O2 ->[MnO2] 2H2O + O2 ^"), "2H₂O₂ → (MnO₂) 2H₂O + O₂ ↑");
    assert.equal(chemistryText("Ag+ + Cl- -> AgCl v"), "Ag⁺ + Cl⁻ → AgCl ↓");
    assert.equal(chemistryText("A <-> B"), "A ↔ B");
    assert.equal(chemistryText("$x$ H2O"), "$x$ H₂O");
  });

  it("writes \\pu quantities as siunitx does", () => {
    assert.equal(physicalUnitText("25 kJ.mol-1"), "25 kJ mol⁻¹");
    assert.equal(physicalUnitText("25 kJ/mol"), "25 kJ/mol");
    assert.equal(physicalUnitText("1.2e3 K"), "1.2 × 10³ K");
    assert.equal(physicalUnitText("-40 kJ mol^-1"), "−40 kJ mol⁻¹");
  });

  it("leaves text without formulas alone, and \\chemfig out", () => {
    assert.equal(mhchemToText("No chemistry here, \\cite{x}."), "No chemistry here, \\cite{x}.");
    assert.equal(mhchemToText("see \\chemfig{C(-[2]H)(-[4]H)} here"), "see  here");
  });
});

describe("formulas in a paper's LaTeX source", () => {
  it("reads \\ce, \\ch and \\pu as the PDF prints them, not as accents", () => {
    assert.equal(
      convert("We reduced \\ce{CO2} to \\ce{HCOO-} with \\ce{[Ru(bpy)3]^2+} and \\ch{H2SO4}; $\\Delta H = \\pu{-92 kJ/mol}$."),
      "We reduced CO₂ to HCOO⁻ with [Ru(bpy)₃]²⁺ and H₂SO₄; $\\Delta H = −92 kJ/mol$.",
    );
  });

  it("reads a formula a paper's macro writes", () => {
    assert.equal(convert("The \\cat{} gave formate.", "\\usepackage{mhchem}\\newcommand{\\cat}{\\ce{Fe^{III}}}"), "The Fe(III) gave formate.");
  });

  it("reads letter accents only as commands of their own", () => {
    // Before, "\vec" was "ěc" and "\verb" "ěrb": any command starting with c, v, u or H lost its first letter.
    assert.equal(convert("Fran\\c{c}ois, Fran\\c cois, \\v{S}koda, Erd\\H{o}s, Gr\\\"obner and \\u{g}."), "François, François, Škoda, Erdős, Gröbner and ğ.");
    assert.equal(convert("A \\vec v and \\cite{x}."), "A v and [x].");
  });
});
