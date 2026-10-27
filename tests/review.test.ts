import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { parseVerdict, reviewPrompt } from "../src/agent/review.ts";
import { labelledQuotesFound } from "../src/agent/support.ts";
import { describeStatus } from "../src/app/research/trace.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";

class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 4096 };
  readonly requests: GenerationRequest[] = [];
  private readonly replies: string[];
  constructor(replies: string[]) {
    this.replies = [...replies];
  }
  supportsConstrainedDecoding() {
    return true;
  }
  async *generate(request: GenerationRequest) {
    this.requests.push(request);
    yield { text: this.replies.shift() ?? "{}", done: false };
    yield { text: "", done: true, usage: { promptTokens: 100, completionTokens: 5 } };
  }
  async dispose() {}
}

const MPL = {
  id: "mpl",
  title: "MPL-2.0",
  text:
    "Your rights are reinstated if the Contributor fails to notify You of the non-compliance prior to 60 days after You have come back into compliance. " +
    "Your grants are reinstated on an ongoing basis if You become compliant prior to 30 days after Your receipt of the notice.",
};
const library = new ResearchLibrary([MPL]);
const QUESTION = "How many days after a notice of non-compliance does the licence give me to comply?";
const search = `{"tool":"search","args":{"query":"notice non-compliance days"}}`;
const read = `{"tool":"read","args":{"docId":"mpl"}}`;
// Field task f23's mistake: a real quote, with the number from the wrong clause. The word checks pass it.
const wrong = JSON.stringify({
  tool: "final_answer",
  args: {
    found: true,
    answer: "You have 60 days after the notice of non-compliance to come back into compliance.",
    evidence: [{ docId: "mpl", quote: "fails to notify You of the non-compliance prior to 60 days after You have come back into compliance" }],
  },
});

const ask = (review: string) => {
  const model = new ScriptedModel([search, read, wrong, review]);
  return { model, result: runResearch({ question: QUESTION, library, model }) };
};

describe("the model's own check of an answer", () => {
  it("reads the verdict from JSON or a lone word, and nothing else", () => {
    assert.equal(parseVerdict(`{"verdict":"partly"}`), "partly");
    assert.equal(parseVerdict(`<think>hmm</think>\n{"verdict": "YES"}`), "yes");
    assert.equal(parseVerdict("No."), "no");
    assert.equal(parseVerdict("Yes, mostly, but the number differs."), undefined);
    assert.equal(parseVerdict(""), undefined);
  });

  it("shows the model each verified quote in the text around it, and leaves out quotes not found", () => {
    const evidence = checkEvidence(
      [
        { docId: "mpl", quote: "prior to 60 days after You have come back into compliance" },
        { docId: "mpl", quote: "a quote the source does not have" },
      ],
      () => MPL.text,
    );
    const prompt = reviewPrompt(QUESTION, "60 days.", evidence, () => "MPL-2.0");
    assert.match(prompt, /^Question: How many days/);
    assert.match(prompt, /1\. From "MPL-2\.0": Your rights are reinstated .*\[prior to 60 days after You have come back into compliance\.\] Your grants/);
    assert.doesNotMatch(prompt, /does not have/);
    assert.doesNotMatch(prompt, /^2\./m);
  });

  it("takes the label away when the model does not confirm the answer (field task f23)", async () => {
    const { model, result } = ask(`{"verdict":"partly"}`);
    const { support, status, evidence } = await result;
    assert.equal(model.requests.length, 4, "one review call after the agent's three");
    assert.ok(model.requests[3]!.responseSchema, "the review is constrained to a verdict");
    assert.equal(support!.review, "partly");
    assert.equal(labelledQuotesFound(status, evidence, support), false);
    assert.equal(describeStatus(status as "verified", evidence, support).label, "Quotes found, answer not confirmed");
    assert.match(describeStatus(status as "verified", evidence, { ...support!, review: "no" }).detail, /model said they do not/);
  });

  it("keeps the label when the model confirms it, or gives no readable verdict", async () => {
    for (const [reply, review] of [
      [`{"verdict":"yes"}`, "yes"],
      ["I am not sure.", undefined],
    ] as const) {
      const { support, status, evidence } = await ask(reply).result;
      assert.equal(support!.review, review);
      assert.equal(labelledQuotesFound(status, evidence, support), true);
      assert.equal(describeStatus(status as "verified", evidence, support).label, "Quotes found");
    }
  });

  it("asks only about answers the word checks would label", async () => {
    const unbacked = JSON.stringify({
      tool: "final_answer",
      args: {
        found: true,
        answer: "The licence was written by the Free Software Foundation in Boston.",
        evidence: [{ docId: "mpl", quote: "prior to 60 days after You have come back into compliance" }],
      },
    });
    const model = new ScriptedModel([search, read, unbacked]);
    const { support } = await runResearch({ question: QUESTION, library, model });
    assert.equal(model.requests.length, 3);
    assert.equal(support!.review, undefined);
  });

  it("keeps the label of answers saved before the check", () => {
    assert.equal(labelledQuotesFound("verified", [{ verified: true }], { judged: 1, backed: 1 }), true);
  });
});
