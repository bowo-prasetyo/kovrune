import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { registrations } from "../eval/clinical/trials.ts";

describe("a paper's trial registrations", () => {
  it("finds ISRCTN, ClinicalTrials.gov, ANZCTR and PACTR numbers, each once", () => {
    const text = "Registered as ISRCTN19917787 and NCT04303507 (NCT04303507); ACTRN12618001268235. PACTR201811548436153. Not NCT123 or XISRCTN19917787.";
    assert.deepEqual([...registrations(text)].sort(), ["ACTRN12618001268235", "ISRCTN19917787", "NCT04303507", "PACTR201811548436153"]);
  });

  it("gives every clinical suite paper's number but the betamethasone trial's, which predates registration", async () => {
    const counts: Record<string, number> = {};
    for (const name of ["folic-acid-pregnancy", "iv-iron-pregnancy-malawi", "betamethasone-50-years"]) {
      counts[name] = registrations(await readFile(new URL(`../eval/clinical/docs/${name}.md`, import.meta.url), "utf8")).size;
    }
    assert.deepEqual(counts, { "folic-acid-pregnancy": 1, "iv-iron-pregnancy-malawi": 1, "betamethasone-50-years": 0 });
  });
});
