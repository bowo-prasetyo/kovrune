import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { definitions, longFormOf } from "../src/tools/abbreviations.ts";
import { DocumentIndex } from "../src/tools/search.ts";

describe("abbreviations a library defines (harness 0.68.0)", () => {
  it("finds a long form whose letters hold the short form in order (Schwartz and Hearst)", () => {
    assert.equal(longFormOf("FEA", "This memo reports the finite element analysis"), "finite element analysis");
    assert.equal(longFormOf("ZVS", "soft switching through zero-voltage switching"), "zero-voltage switching");
    assert.equal(longFormOf("SiC", "Silicon carbide"), "Silicon carbide");
    assert.equal(longFormOf("MPa", "Yield strength"), undefined, "a unit in brackets is not an abbreviation");
  });

  it("reads definitions from text, and not units, counts or asides in brackets", () => {
    const text =
      "Immunity was tested to the electrostatic discharge (ESD) and electrical fast transient (EFT) standards. " +
      "The yield strength (MPa) was measured on 96 specimens (n = 96), and the result (see Table 2) held. " +
      "Rapid tests were read by capillary haemoglobin (by RDT) where available.";
    assert.deepEqual(definitions(text), [
      { short: "ESD", long: "electrostatic discharge" },
      { short: "EFT", long: "electrical fast transient" },
    ]);
  });

  it("lets a search in words find a passage that uses only the abbreviation", () => {
    const docs = [
      { id: "intro", title: "Paper, part 1", text: "Soft switching through zero-voltage switching (ZVS) reduces the turn-on loss." },
      { id: "results", title: "Paper, part 2", text: "ZVS was achieved above 35% load with the adaptive dead time." },
      { id: "other", title: "Notes", text: "Switching losses at light load were discussed. The voltage was measured at zero load." },
    ];
    const index = new DocumentIndex(docs);
    assert.ok(index.expandedTerms("Above what load was zero-voltage switching achieved?").includes("zvs"));
    assert.deepEqual(index.search("Above what load was zero-voltage switching achieved?", 2).map((h) => h.docId), ["results", "intro"]);
    // Without the definition, a passage that shares the question's words ranks above the one that answers.
    assert.equal(new DocumentIndex(docs.slice(1)).search("Above what load was zero-voltage switching achieved?", 2)[0]?.docId, "other");
    // A query with the abbreviation is not given its long form's words.
    assert.deepEqual(index.expandedTerms("ZVS load"), ["zvs", "load"]);
  });
});
