// Chemical names a search treats as one (harness 0.94.0): the query side only (src/tools/chemical-names.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { words } from "../src/documents/scripts.ts";
import { chemicalNameTerms, CHEMICAL_NAMES } from "../src/tools/chemical-names.ts";

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
