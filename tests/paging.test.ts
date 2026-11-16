// A long document is not read part after part (harness 0.88.0): the third read in a row of the next part
// gives the unread part that best matches the question, says so, and asking again gives the part asked for.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runResearch, ResearchLibrary } from "../src/agent/research.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";
import { SourceSession } from "../src/sources/session.ts";
import type { OpenSource } from "../src/sources/types.ts";
import { createResearchTools, PAGING_MIN_PARTS, PAGING_NOTE_LINE } from "../src/tools/research.ts";
import { DocumentIndex } from "../src/tools/search.ts";

const question = "What consensus mechanism do decentralized language model networks use?";
/** A document of `n` parts; part 37, when there is one, answers the question. */
const parts = (doc: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${doc}#${i + 1}`,
    title: `Survey, part ${i + 1}`,
    text: i + 1 === 37 ? "Decentralized language model networks use a proof-of-stake consensus mechanism among their nodes." : `Background material number ${i + 1} about the history of the field.`,
  }));

const reader = (index: DocumentIndex, session?: SourceSession) => {
  const read = createResearchTools(index, session, question).find((t) => t.name === "read")!;
  return async (docId: string) => {
    const result = await read.execute!({ docId });
    return typeof result === "string" ? { text: result } : (result as { text: string; repeatable?: boolean; shown?: string });
  };
};

describe("paging through a long document", () => {
  it("gives the best-matching unread part at the third read in a row of the next part", async () => {
    const read = reader(new DocumentIndex(parts("survey", 119)));
    assert.match((await read("survey#62")).text, /^\[survey#62\]/);
    assert.match((await read("survey#1")).text, /^\[survey#1\]/);
    assert.match((await read("survey#2")).text, /^\[survey#2\]/);
    const third = await read("survey#3");
    assert.match(third.text, /^\[survey#37\] Survey, part 37\nDecentralized language model networks use a proof-of-stake/);
    assert.match(third.text, /\[You asked for part 3\. Reading a long document part after part takes many steps, so this is the unread part that best matches the question\. To read survey#3 anyway, ask for it again\.\]$/);
    assert.equal(third.repeatable, true);
    assert.equal(third.shown, "survey#37, the best match, not part 3");
  });

  it("gives the part asked for when asked again, and redirects only to an unread part", async () => {
    const read = reader(new DocumentIndex(parts("survey", 119)));
    for (const id of ["survey#1", "survey#2"]) await read(id);
    assert.match((await read("survey#3")).text, /^\[survey#37\]/);
    assert.match((await read("survey#3")).text, /^\[survey#3\] Survey, part 3\n/, "asked again: the part itself");
    // Paging on: 4 after 3 after... the redirect skips part 37, already read, for the next best.
    const fourth = await read("survey#4");
    assert.doesNotMatch(fourth.text, /^\[survey#37\]/);
  });

  it("leaves a short document's parts in order, and a read that does not follow the last two", async () => {
    const short = reader(new DocumentIndex(parts("article", PAGING_MIN_PARTS - 1)));
    for (const n of [1, 2, 3, 4]) assert.match((await short(`article#${n}`)).text, new RegExp(`^\\[article#${n}\\]`));
    const long = reader(new DocumentIndex(parts("survey", 40)));
    for (const id of ["survey#1", "survey#5", "survey#6", "survey#2"]) assert.doesNotMatch((await long(id)).text, /You asked for part/);
  });

  it("works for an open source's document, through its session", async () => {
    const text = parts("x", 40).map((p) => p.text.padEnd(1700, ".")).join("\n\n");
    const source: OpenSource = { name: "arxiv", label: "arXiv", search: async () => [], fetch: async (id) => ({ id, title: "A survey", text, url: "u", retrievedAt: "t" }) };
    const session = new SourceSession([source], question);
    const read = reader(new DocumentIndex([]), session);
    await read("arxiv:2505.01658#1");
    await read("arxiv:2505.01658#2");
    const third = await read("arxiv:2505.01658#3");
    assert.match(third.text, /\(part 37 of \d+\)\nDecentralized language model networks use a proof-of-stake/);
    assert.match(third.text, /To read arxiv:2505\.01658#3 anyway, ask for it again\.\]/);
    assert.match(third.shown!, /^part 37 of \d+, the best match, not part 3$/);
  });

  it("is left out when an old read is shortened", () => {
    assert.equal("[a#37] T\nText.\n\n[You asked for part 3. Reading … ask for it again.]".replace(PAGING_NOTE_LINE, ""), "[a#37] T\nText.");
  });
});

/** A model that replays fixed replies. */
class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 32768 };
  readonly requests: GenerationRequest[] = [];
  private readonly replies: string[];
  constructor(replies: string[]) {
    this.replies = [...replies];
  }
  supportsConstrainedDecoding() {
    return false;
  }
  async *generate(request: GenerationRequest) {
    this.requests.push(request);
    yield { text: this.replies.shift() ?? "{}", done: false };
    yield { text: "", done: true, usage: { promptTokens: 10, completionTokens: 10 } };
  }
  async dispose() {}
}

describe("asking again for the part a redirected read skipped", () => {
  it("is no repeat to the agent: the part is read", async () => {
    const read = (docId: string) => JSON.stringify({ tool: "read", args: { docId } });
    const model = new ScriptedModel([
      JSON.stringify({ tool: "search", args: { query: "consensus mechanism" } }),
      read("survey#1"),
      read("survey#2"),
      read("survey#3"),
      read("survey#3"),
      JSON.stringify({ tool: "final_answer", args: { found: true, answer: "Proof-of-stake.", evidence: [{ docId: "survey#37", quote: "Decentralized language model networks use a proof-of-stake consensus mechanism among their nodes." }] } }),
    ]);
    const result = await runResearch({ question, library: new ResearchLibrary(parts("survey", 60)), model, constrained: false });
    const reads = result.agent.calls.filter((c) => c.tool === "read");
    assert.deepEqual(reads.map((c) => c.shown ?? ""), ["", "", "survey#37, the best match, not part 3", ""], "the third read gave the best match");
    const said = result.agent.transcript.map((m) => m.content).join("\n");
    assert.match(said, /\[survey#3\] Survey, part 3\nBackground material number 3/, "asked again, the part asked for, not the repeat guard's reply");
    assert.equal(result.final?.answer, "Proof-of-stake.");
  });
});
