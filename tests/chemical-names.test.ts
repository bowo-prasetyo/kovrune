// Chemical names a search treats as one (harness 0.98.0): the query side only (src/tools/chemical-names.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { words } from "../src/documents/scripts.ts";
import { chemicalNameTerms, CHEMICAL_NAMES, MATERIALS_NAMES, materialsNameAlternatives } from "../src/tools/chemical-names.ts";
import { DocumentIndex } from "../src/tools/search.ts";

/** The terms a query adds, its other spellings' words (search.ts stems them as well). */
const added = (query: string) => new Set(chemicalNameTerms(query, words));

describe("chemical names", () => {
  it("adds a substance's other spellings to a query", () => {
    const terms = added("dichloromethane");
    assert.ok(terms.has("dcm") && terms.has("ch2cl2"), [...terms].join(" "));
    assert.ok(added("Hünig's base").has("dipea"));
    assert.ok(added("tricyclohexylphosphine").has("pcy3"));
    // A formula as papers print it, subscripts and all, is the same formula.
    assert.ok(added("CO₂ reduction").has("dioxide"), [...added("CO₂ reduction")].join(" "));
    // An element's symbol in a formula names the metal.
    assert.ok(added("Pd(OAc)2").has("palladium"));
  });

  it("reads an abbreviation only in its case", () => {
    assert.ok(added("Is the HER suppressed?").has("evolution"));
    assert.equal(added("Did her group measure it?").has("evolution"), false);
    assert.ok(added("in DMA").has("dimethylacetamide"));
    assert.equal([...added("a dma study")].length, 0);
  });

  it("adds only formulas, abbreviations and one-word names for a name written in ordinary words", () => {
    // "methanol dehydrogenase" is an enzyme: it searched "methyl alcohol" too, whose ordinary words changed what a lab question found.
    const enzyme = added("methanol dehydrogenase activity");
    assert.ok(enzyme.has("meoh") && enzyme.has("ch3oh"), [...enzyme].join(" "));
    assert.equal(enzyme.has("methyl") || enzyme.has("alcohol"), false);
    // A query writing the formula is about the chemical, and adds every spelling.
    const formula = added("FeTPP");
    assert.ok(formula.has("tetraphenylporphyrin") && formula.has("iron"), [...formula].join(" "));
  });

  it("adds no numbers and no words that say nothing alone", () => {
    for (const query of ["formic acid", "Hünig's base", "[Ru(bpy)3](PF6)2"]) {
      for (const term of added(query)) {
        assert.ok(!/^\d+$/.test(term), `${query}: ${term}`);
        assert.ok(!["acid", "base", "reaction"].includes(term), `${query}: ${term}`);
      }
    }
  });

  it("lists each spelling once", () => {
    const all = CHEMICAL_NAMES.flat();
    const repeated = all.filter((s, i) => all.indexOf(s) !== i);
    assert.deepEqual(repeated, []);
    assert.equal(chemicalNameTerms("nothing chemical here", (t) => [t]).length, 0);
  });
});

describe("materials names (harness 0.108.0)", () => {
  const alternatives = (query: string) => materialsNameAlternatives(query, words);
  const addedFor = (query: string) => new Set(alternatives(query).flatMap((a) => a.added));

  it("bridges a word, an acronym and a formula, adding only one-word spellings", () => {
    assert.ok(addedFor("titania nanotubes").has("tio2"));
    assert.ok(addedFor("laser powder bed fusion").has("slm"));
    const sps = addedFor("SPS");
    assert.ok(sps.has("pecs"));
    for (const word of ["field", "assisted", "sintering", "spark", "plasma", "current"]) assert.ok(!sps.has(word), `"SPS" does not add "${word}"`);
    assert.deepEqual(alternatives("LLZO")[0]!.own, [["llzo"]]);
  });

  it("reads an abbreviation of two entries as neither for sure: LFP adds LiFePO4, not laser flash photolysis's words", () => {
    assert.ok(addedFor("LFP cycling").has("lifepo4"));
    const chemical = added("LFP cycling");
    for (const word of ["laser", "flash", "photolysis"]) assert.ok(!chemical.has(word), `"LFP" does not add "${word}"`);
    // The chemistry entries are as they were: an abbreviation of one entry adds its every spelling.
    assert.ok(added("FeTPP").has("tetraphenylporphyrin"));
  });

  it("counts a material's other spellings only in a passage without the query's own spelling", () => {
    const index = new DocumentIndex([
      { id: "own", title: "a", text: "LLZO pellets were sintered. LLZO conductivity was measured at 25 °C." },
      { id: "both", title: "b", text: "LLZO pellets, Li7La3Zr2O12, were sintered; Li7La3Zr2O12 conductivity was measured." },
      { id: "formula", title: "c", text: "Li7La3Zr2O12 pellets were sintered and their conductivity measured." },
      { id: "other", title: "d", text: "Steel was annealed and its hardness measured." },
    ]);
    const ranked = index.search("LLZO conductivity", 4).map((hit) => hit.docId);
    assert.ok(ranked.includes("formula"), "a passage writing only the formula is found");
    // "both" gains nothing from its formula: "own", writing the query's spelling twice, stays first.
    assert.equal(ranked[0], "own");
  });

  it("lists each materials spelling once, and no materials entry repeats a chemical one but LFP", () => {
    const all = MATERIALS_NAMES.flat();
    assert.deepEqual(all.filter((s, i) => all.indexOf(s) !== i), []);
    const chemical = new Set(CHEMICAL_NAMES.flat());
    assert.deepEqual(all.filter((s) => chemical.has(s)), ["LFP"]);
  });
});
