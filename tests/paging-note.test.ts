// A long document read part after part gets its outline again (harness 0.103.0): the part asked for, then
// where the sections are, once per document.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SourceSession } from "../src/sources/session.ts";
import type { OpenSource } from "../src/sources/types.ts";
import { createResearchTools, PAGING_MIN_PARTS, PAGING_NOTE_LINE } from "../src/tools/research.ts";
import { DocumentIndex } from "../src/tools/search.ts";

const question = "What consensus mechanism does Gradient Coin use?";
/** A paper of `n` parts of about one part each, with a section heading every tenth part. */
const paper = (n: number) =>
  Array.from({ length: n }, (_, i) => `${i % 10 === 0 ? `## ${i / 10 + 1} Section ${i / 10 + 1}\n\n` : ""}Paragraph ${i + 1}. ${"Words about the system. ".repeat(70)}`).join("\n\n");

const reader = (n: number) => {
  const source: OpenSource = { name: "arxiv", label: "arXiv", search: async () => [], fetch: async (id) => ({ id, title: "Gradient Coin", text: paper(n), url: "u", retrievedAt: "t" }) };
  const read = createResearchTools(new DocumentIndex([]), new SourceSession([source], question), question).find((t) => t.name === "read")!;
  return async (docId: string) => {
    const result = await read.execute!({ docId });
    return typeof result === "string" ? result : (result as { text: string }).text;
  };
};

describe("reading a long document part after part", () => {
  it("gives the part asked for, then the outline, at the third part in a row, once", async () => {
    const read = reader(40);
    await read("arxiv:2308.10502#62".replace("62", "30"));
    await read("arxiv:2308.10502#1");
    await read("arxiv:2308.10502#2");
    const third = await read("arxiv:2308.10502#3");
    assert.match(third, /^\[arxiv:2308\.10502#3\]/, "the part asked for");
    assert.match(third, /\[You have read parts 1 to 3 of arxiv:2308\.10502 in order, which takes many steps\. Its sections are at: .*#\d+ 2 Section 2.*\. Read the part whose section fits the question, or search for it\.\]/);
    assert.doesNotMatch(await read("arxiv:2308.10502#4"), /You have read parts/, "once per document");
  });

  it("says nothing for a shorter document, or reads that do not follow each other", async () => {
    const short = reader(PAGING_MIN_PARTS - 2);
    for (const n of [1, 2, 3, 4]) assert.doesNotMatch(await short(`arxiv:1#${n}`), /You have read parts/);
    const long = reader(40);
    for (const id of ["arxiv:1#1", "arxiv:1#5", "arxiv:1#6", "arxiv:1#2"]) assert.doesNotMatch(await long(id), /You have read parts/);
  });

  it("is left out when an old read is shortened", () => {
    assert.equal("[a#3] T\nText.\n\n[You have read parts 1 to 3 of a in order, which takes many steps. Its sections are at: #1 Intro. Read the part whose section fits the question, or search for it.]".replace(PAGING_NOTE_LINE, ""), "[a#3] T\nText.");
  });
});
