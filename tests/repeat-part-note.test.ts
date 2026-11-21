// A read that gives a part already given gets the outline again (harness 0.104.0): the part, then where
// the sections are, once per document. The agent's repeat guard compares the call, not what came back.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SourceSession } from "../src/sources/session.ts";
import type { OpenSource } from "../src/sources/types.ts";
import { createResearchTools, REPEAT_PART_NOTE_LINE } from "../src/tools/research.ts";
import { DocumentIndex } from "../src/tools/search.ts";

const question = "How does blood circulate?";
/** An article whose lead repeats the question's words, with a section heading every tenth part. */
const article = (n: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      `${i % 10 === 0 ? `## Section ${i / 10 + 1}\n\n` : ""}Paragraph ${i + 1}. ${i < 10 ? "Blood circulation is the circulation of blood. ".repeat(40) : "The heart contracts and drives the fluid onward through the vessels. ".repeat(40)}`,
  ).join("\n\n");

const reader = (n: number) => {
  const source: OpenSource = {
    name: "wikipedia",
    label: "Wikipedia",
    search: async () => [],
    fetch: async (id) => ({ id, title: "Circulatory system", text: article(n), url: "u", retrievedAt: "t" }),
  };
  const read = createResearchTools(new DocumentIndex([]), new SourceSession([source], question), question).find((t) => t.name === "read")!;
  return async (docId: string) => {
    const result = await read.execute!({ docId });
    return typeof result === "string" ? result : (result as { text: string }).text;
  };
};

describe("a read that gives a part already given", () => {
  it("gives the part, then the outline, once per document", async () => {
    const read = reader(21);
    // The article whole: the part that best matches the question, with its outline.
    const first = await read("wikipedia:Circulatory_system");
    const given = /^\[([^\]]*)\] Circulatory system \((part \d+ of \d+)\)/.exec(first);
    assert.ok(given, "a part of the article, with its number");
    assert.match(first, /\[Outline of wikipedia:Circulatory_system/);
    assert.doesNotMatch(first, /already/);
    // The same part by its ID: a different call, so the agent's repeat guard lets it through.
    const again = await read(given[1]!);
    assert.match(again, new RegExp(`^\\[${given[1]!}\\]`), "still the part asked for");
    assert.match(
      again,
      new RegExp(
        `\\[You have read ${given[2]!} of wikipedia:Circulatory_system already, and this is it again\\. Its sections are at: .*#\\d+ Section 2.*\\. Read the part whose section fits the question, or search for it\\.\\]`,
      ),
    );
    assert.doesNotMatch(await read("wikipedia:Circulatory_system"), /already, and this is it again/, "once per document");
  });

  it("says nothing for a part given for the first time", async () => {
    const read = reader(21);
    await read("wikipedia:Circulatory_system#1");
    for (const n of [2, 3, 11]) assert.doesNotMatch(await read(`wikipedia:Circulatory_system#${n}`), /already/);
    // The note is about the part given, not the call: part 2, given once above, gets it on its second.
    assert.match(await read("wikipedia:Circulatory_system#2"), /already, and this is it again/);
  });

  it("says nothing for a document of one part, which has nowhere else to go", async () => {
    const read = reader(1);
    await read("wikipedia:Circulatory_system");
    assert.doesNotMatch(await read("wikipedia:Circulatory_system"), /already/);
  });

  it("is left out when an old read is shortened", () => {
    const observation = "[a#1] T\nText.\n\n[You have read part 1 of 21 of a already, and this is it again. Its sections are at: #11 Section 2. Read the part whose section fits the question, or search for it.]";
    assert.equal(observation.replace(REPEAT_PART_NOTE_LINE, ""), "[a#1] T\nText.");
  });
});
