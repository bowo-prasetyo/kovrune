import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { outlineOf, OUTLINE_CHARS, partHeadings } from "../src/documents/outline.ts";
import { textWeight } from "../src/documents/scripts.ts";
import { ResearchLibrary } from "../src/agent/research.ts";
import { createResearchTools } from "../src/tools/research.ts";
import { loadFieldSuite } from "../eval/harness/field.ts";

describe("a long document's outline", () => {
  it("takes Markdown headings, table captions and short heading lines, each as its first line", () => {
    const text = "### Findings\n\nThe risk ratio was 0·45.\n\n**Table 1** Baseline characteristics\n\n| Age | 22 |\n\nTable 2: : Outcomes\n\nMethods\n\nA long sentence that is not a heading at all.";
    assert.deepEqual(partHeadings(text), ["Findings", "Table 1: Baseline characteristics", "Table 2: Outcomes", "Methods"]);
  });

  it("takes Setext headings, underlined by === or ---, as the MPL-2.0 has them", () => {
    const text = "Mozilla Public License Version 2.0\n==================================\n\n5. Termination\n--------------\n\n5.1. The rights granted under this License will terminate automatically\nif You fail to comply.\n\nExhibit A - Source Code Form License Notice\n-------------------------------------------";
    assert.deepEqual(partHeadings(text), ["Mozilla Public License Version 2.0", "5. Termination", "Exhibit A - Source Code Form License Notice"]);
  });

  it("lists the parts that have headings, at most two each, and is cut at its length limit", () => {
    const parts = [1, 2, 3, 4].map((n) => ({ id: `doc#${n}`, text: n === 2 ? "No heading here, just a sentence." : `## Part ${n} title\n\nText.\n\n## Second ${n}\n\nText.\n\n## Third ${n}\n\nText.` }));
    assert.equal(outlineOf(parts), "#1 Part 1 title / Second 1; #3 Part 3 title / Second 3; #4 Part 4 title / Second 4");
    assert.equal(outlineOf(parts.slice(0, 3)), undefined, "documents in few parts have none");
    const many = Array.from({ length: 200 }, (_, n) => ({ id: `doc#${n + 1}`, text: `## Section number ${n + 1}\n\nText.` }));
    const long = outlineOf(many)!;
    assert.ok(textWeight(long) <= OUTLINE_CHARS + 3 && long.endsWith("…"), `cut: ${textWeight(long)}`);
  });

  it("shows the outline on the first read of a long document's part, and when the whole document is asked for", async () => {
    const field = await loadFieldSuite();
    const read = createResearchTools(field.clinicalLibrary.index, undefined, "What was the risk ratio?").find((t) => t.name === "read")!;
    const first = String(await read.execute!({ docId: "ipt-malaria-pregnancy#44" }));
    assert.match(first, /\[Outline of ipt-malaria-pregnancy, .*#3 Findings;.*#19 Table 1: Baseline characteristics by study group/);
    assert.doesNotMatch(String(await read.execute!({ docId: "ipt-malaria-pregnancy#46" })), /Outline of/, "once per document");
    assert.match(String(await read.execute!({ docId: "typhoid-vaccine-malawi" })), /split into 36 parts, .* What they hold: #1 .*Table 1: Baseline characteristics/);
  });

  it("leaves short documents as they were", async () => {
    const library = new ResearchLibrary([{ id: "short", title: "Short", text: "One paragraph." }]);
    const read = createResearchTools(library.index).find((t) => t.name === "read")!;
    assert.equal(String(await read.execute!({ docId: "short" })), "[short] Short\nOne paragraph.");
  });
});
