// Three label fixes from a preview user's reports (harness 0.86.0): a list written into one sentence is
// checked item by item, a quote copied into the answer is not failed by its document's ID, and an
// introduction's sentences that only restate the report's questions are not judged.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listItems, sentenceSupport } from "../src/agent/support.ts";
import { SYNTHESIS_NOTE } from "../src/app/research/answers.ts";

const ev = (docId: string, quote: string) => ({ docId, quote, verified: true });
const marks = (s: ReturnType<typeof sentenceSupport>) => s.sentences.map((t) => (t.backed === undefined ? "·" : t.backed ? "✓" : "⚠")).join("");

describe("a list written into one sentence", () => {
  it("is split at its items when the markers run in sequence from 1 or a", () => {
    assert.deepEqual(listItems("Three challenges: 1) cost is high. 2) trees bloat. 3) runs are unstable."), [
      "Three challenges: ",
      "1) cost is high. ",
      "2) trees bloat. ",
      "3) runs are unstable.",
    ]);
    assert.deepEqual(listItems("It works by (a) seeding the population and (b) explaining the result."), ["It works by ", "(a) seeding the population and ", "(b) explaining the result."]);
    assert.deepEqual(listItems("Steps: 1. open it 2. save it"), ["Steps: ", "1. open it ", "2. save it"]);
  });

  it("is left whole without a sequence: one marker, a reference, or numbers out of order", () => {
    for (const sentence of ["The loss in (2) is minimised as in Table 1. here.", "Only 1) is shown.", "Items 2) and 3) differ.", "Plan a) is fine and c) too."]) {
      assert.deepEqual(listItems(sentence), [sentence]);
    }
  });

  it("backs each item by its own quote, and marks the one no quote backs", () => {
    const support = sentenceSupport(
      "Two challenges are known: 1) Cost: GP suffers from the high computational cost of simulation-based evaluation, addressed with predictive models. 2) Stability: convergence often fails on new tasks because of starting over.",
      [ev("evospeak", "Surrogate-assisted GP addresses the high computational cost of simulation-based evaluation by approximating heuristic performance with predictive models.")],
    );
    // The lead-in claims something too ("two challenges"), so it is judged like any sentence.
    assert.equal(marks(support), "⚠✓⚠");
    assert.deepEqual([support.judged, support.backed], [3, 1]);
    assert.equal(support.sentences.map((s) => s.text).join(""), "Two challenges are known: 1) Cost: GP suffers from the high computational cost of simulation-based evaluation, addressed with predictive models. 2) Stability: convergence often fails on new tasks because of starting over.", "the sentences join back into the answer");
  });
});

describe("a quote copied into the answer with its document's ID", () => {
  const quote = "InsightSR achieves a 95% exact recovery rate and an average R2 of 0.9999, outperforming the previous state of the art.";
  it("is backed: the ID's numbers are not the sentence's", () => {
    const support = sentenceSupport(`Evidence:\n- From arxiv:2608.25291#13: "${quote}"`, [ev("arxiv:2608.25291#13", quote)]);
    assert.equal(marks(support), "·✓");
    assert.match(support.sentences[1]!.text, /^- From arxiv:2608\.25291#13: /, "shown as written");
  });

  it("is still checked: a number the quote lacks is not backed", () => {
    const support = sentenceSupport(`- From arxiv:2608.25291#13: "InsightSR achieves a 97% exact recovery rate and an average R2 of 0.9999."`, [ev("arxiv:2608.25291", quote)]);
    assert.equal(marks(support), "⚠");
  });
});

describe("an introduction that says what the report covers", () => {
  const questions = [
    "How do researchers integrate Large Language Models as fitness functions within Genetic Programming frameworks?",
    "What challenges regarding computational cost or interpretability are identified when combining LLMs with Genetic Programming?",
  ].join("\n");

  it("is not judged where it only restates the report's questions, and is where it states a finding", () => {
    const support = sentenceSupport(
      "This report examines how researchers integrate Large Language Models as fitness functions within Genetic Programming frameworks. It further identifies the challenges regarding computational cost and interpretability. LLMs cut evaluation cost by 40 percent in three studies.",
      [],
      undefined,
      undefined,
      questions,
    );
    assert.equal(marks(support), "··⚠");
    assert.deepEqual([support.judged, support.backed], [1, 0]);
  });

  it("is judged as before without the questions, as the conclusion and every answer are", () => {
    const support = sentenceSupport("This report examines how researchers integrate Large Language Models as fitness functions within Genetic Programming frameworks.", []);
    assert.equal(marks(support), "⚠");
  });

  it("is explained under the report", () => {
    assert.match(SYNTHESIS_NOTE, /except the introduction's sentences that only restate the report's questions/);
  });
});
