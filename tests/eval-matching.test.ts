import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { containsPhrase } from "../eval/harness/matching.ts";
import { givesFacts, matchSection } from "../eval/harness/report-score.ts";

describe("evaluation phrase matching", () => {
  it("does not count a number or acronym embedded in a larger token", () => {
    assert.equal(containsPhrase("The size is 14 KiB.", "4 KiB"), false);
    assert.equal(containsPhrase("AMPL is a library.", "MPL"), false);
    assert.equal(containsPhrase("unborn children", "born"), false);
  });
  it("matches complete phrases across case, whitespace and Unicode compatibility forms", () => {
    assert.equal(containsPhrase("The license is mpl-2.0.", "MPL-2.0"), true);
    assert.equal(containsPhrase("Storage is 4   KiB.", "4 KiB"), true);
    assert.equal(containsPhrase("The full-width value is ＭＰＬ.", "MPL"), true);
  });
  it("preserves decimal and punctuation-bearing facts", () => {
    assert.equal(containsPhrase("Elevation: 3776.12 m.", "3776.12"), true);
    assert.equal(containsPhrase("Elevation: 13776.12 m.", "3776.12"), false);
  });
  it("uses boundaries for report keywords and expected facts", () => {
    const sections = [{ name: "birth", keywords: ["born"], facts: [["1815"]], citations: [["fixture"]] }];
    assert.equal(matchSection("What was unborn?", sections), undefined);
    assert.equal(givesFacts("She was born in 1815.", sections[0]!), true);
    assert.equal(givesFacts("She was born in 11815.", sections[0]!), false);
  });
});
