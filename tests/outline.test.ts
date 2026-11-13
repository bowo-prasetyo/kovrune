import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { outlineOf, OUTLINE_CHARS, partHeadings } from "../src/documents/outline.ts";
import { textWeight } from "../src/documents/scripts.ts";
import { ResearchLibrary } from "../src/agent/research.ts";
import { SourceSession } from "../src/sources/session.ts";
import type { OpenSource } from "../src/sources/types.ts";
import { createResearchTools } from "../src/tools/research.ts";

describe("a long document's outline", () => {
  it("takes Markdown headings, table captions and short heading lines, each as its first line", () => {
    const text = "### Findings\n\nThe risk ratio was 0·45.\n\n**Table 1** Baseline characteristics\n\n| Age | 22 |\n\nTable 2: : Outcomes\n\nMethods\n\nA long sentence that is not a heading at all.";
    assert.deepEqual(partHeadings(text), ["Findings", "Table 1: Baseline characteristics", "Table 2: Outcomes", "Methods"]);
  });

  it("takes Setext headings, underlined by === or ---, as the MPL-2.0 has them", () => {
    const text = "Mozilla Public License Version 2.0\n==================================\n\n5. Termination\n--------------\n\n5.1. The rights granted under this License will terminate automatically\nif You fail to comply.\n\nExhibit A - Source Code Form License Notice\n-------------------------------------------";
    assert.deepEqual(partHeadings(text), ["Mozilla Public License Version 2.0", "5. Termination", "Exhibit A - Source Code Form License Notice"]);
  });

  it("lists a table's caption with the part that holds its rows, when the caption ends the part before", async () => {
    const parts = [
      { id: "d#1", text: "## Methods\n\nText." },
      { id: "d#2", text: "## Results\n\nText.\n\n**Table 1** Baseline characteristics" },
      { id: "d#3", text: "| | A | B |\n| Age, years | 22·2 | 22·5 |" },
      { id: "d#4", text: "## Discussion\n\nText." },
    ];
    assert.equal(outlineOf(parts), "#1 Methods; #2 Results; #3 Table 1: Baseline characteristics; #4 Discussion");
    // REVAMP's Table 1, which ends part 22 of the trial report, as Europe PMC gives it.
    const text = await readFile(new URL("../eval/clinical/docs/iv-iron-pregnancy-malawi.md", import.meta.url), "utf8");
    const { chunkDocument } = await import("../src/documents/chunk.ts");
    assert.match(outlineOf(chunkDocument({ id: "revamp", title: "REVAMP", text }))!, /; #23 Table 1: Baseline characteristics/);
  });

  it("lists the parts that have headings, at most two each, and is cut at its length limit", () => {
    const parts = [1, 2, 3, 4].map((n) => ({ id: `doc#${n}`, text: n === 2 ? "No heading here, just a sentence." : `## Part ${n} title\n\nText.\n\n## Second ${n}\n\nText.\n\n## Third ${n}\n\nText.` }));
    assert.equal(outlineOf(parts), "#1 Part 1 title / Second 1; #3 Part 3 title / Second 3; #4 Part 4 title / Second 4");
    assert.equal(outlineOf(parts.slice(0, 3)), undefined, "documents in few parts have none");
    const many = Array.from({ length: 200 }, (_, n) => ({ id: `doc#${n + 1}`, text: `## Section number ${n + 1}\n\nText.` }));
    const long = outlineOf(many)!;
    assert.ok(textWeight(long) <= OUTLINE_CHARS + 3 && long.endsWith("…"), `cut: ${textWeight(long)}`);
  });
});

/** An open source that gives one clinical suite paper, as Europe PMC gives it (tests/europepmc.test.ts). */
async function paperSource(): Promise<OpenSource> {
  const text = await readFile(new URL("../eval/clinical/docs/ipt-malaria-pregnancy.md", import.meta.url), "utf8");
  return {
    name: "europepmc",
    label: "Europe PMC",
    search: async () => [],
    fetch: async (id) => ({ id, title: "Chemoprevention for malaria in pregnant women living with HIV", text, url: "https://europepmc.org/article/MED/38224710", retrievedAt: "2026-11-13T00:00:00Z" }),
  };
}

describe("an open-source document's outline", () => {
  it("is shown with the first part read of a long paper, once", async () => {
    const session = new SourceSession([await paperSource()], "What was the risk ratio for malaria infection?");
    const first = await session.read("europepmc:MED/38224710#44");
    assert.match(first, /^\[europepmc:MED\/38224710#44\]/);
    assert.match(first, /\n\[Outline of europepmc:MED\/38224710, to read another part by its ID such as europepmc:MED\/38224710#1: .*#3 Findings;.*Table 1: Baseline characteristics by study group/);
    assert.doesNotMatch(await session.read("europepmc:MED/38224710#3"), /Outline of/, "once per document");
  });

  it("is left out when an old read is shortened", async () => {
    const question = "What was the risk ratio for malaria infection?";
    const session = new SourceSession([await paperSource()], question);
    const read = createResearchTools(new ResearchLibrary([]).index, session, question).find((t) => t.name === "read")!;
    const observation = String(await read.execute!({ docId: "europepmc:MED/38224710#44" }));
    assert.match(observation, /Outline of/);
    const short = read.shorten!({ docId: "europepmc:MED/38224710#44" }, observation)!;
    assert.doesNotMatch(short, /Outline of|#3 Findings/);
  });

  it("is not shown for a short document, or for the user's own documents", async () => {
    const short: OpenSource = { ...(await paperSource()), fetch: async (id) => ({ id, title: "Short", text: "## Methods\n\nOne paragraph.", url: "u", retrievedAt: "t" }) };
    assert.doesNotMatch(await new SourceSession([short], "q").read("europepmc:MED/1"), /Outline of/);
    const text = await readFile(new URL("../eval/clinical/docs/ipt-malaria-pregnancy.md", import.meta.url), "utf8");
    const library = new ResearchLibrary([{ id: "ipt", title: "IPT", text }]);
    const read = createResearchTools(library.index, undefined, "risk ratio").find((t) => t.name === "read")!;
    assert.doesNotMatch(String(await read.execute!({ docId: "ipt#44" })), /Outline of/);
  });
});
