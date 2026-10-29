import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { itemizedReviewPrompt, parseVerdict, reviewAnswer, reviewPrompt, reviewsShortAnswers } from "../src/agent/review.ts";
import { labelledQuotesFound } from "../src/agent/support.ts";
import { describeStatus } from "../src/app/research/trace.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";

class ScriptedModel implements LanguageModel {
  readonly info: { id: string; runtime: "scripted"; contextLength: number };
  readonly requests: GenerationRequest[] = [];
  private readonly replies: string[];
  constructor(replies: string[], id = "scripted") {
    this.replies = [...replies];
    this.info = { id, runtime: "scripted", contextLength: 4096 };
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

  it("asks the itemized prompt about the same material, point by point (audit F2)", async () => {
    const evidence = checkEvidence([{ docId: "mpl", quote: "prior to 60 days after You have come back into compliance" }], () => MPL.text);
    const current = reviewPrompt(QUESTION, "60 days.", evidence, () => "MPL-2.0");
    const itemized = itemizedReviewPrompt(QUESTION, "60 days.", evidence, () => "MPL-2.0");
    // The question, the answer and the passages are shown alike; only the question asked of them differs.
    const material = (prompt: string) => prompt.slice(0, prompt.indexOf("\n\n", prompt.indexOf("1. From")) + 2);
    assert.equal(material(itemized), material(current));
    for (const point of ["- Values:", "- Conditions:", "- Completeness:", "- Nothing added:"]) assert.ok(itemized.includes(point), point);
    assert.match(itemized, /Reply "yes" only if all four hold/);
    assert.match(itemized, /\{"verdict":"yes"\}, \{"verdict":"partly"\} or \{"verdict":"no"\}\.$/);
    // reviewAnswer asks with the prompt it is given (eval/rereview.ts), and with reviewPrompt by default.
    const model = new ScriptedModel([`{"verdict":"partly"}`, `{"verdict":"yes"}`]);
    const ask = (prompt?: typeof reviewPrompt) => reviewAnswer({ model, question: QUESTION, answer: "60 days.", evidence, titleFor: () => "MPL-2.0", prompt });
    assert.equal(await ask(itemizedReviewPrompt), "partly");
    assert.equal(await ask(), "yes");
    assert.deepEqual(model.requests.map((r) => r.messages[1]!.content), [itemized, current]);
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

  it("keeps the label when the model confirms it", async () => {
    const { support, status, evidence } = await ask(`{"verdict":"yes"}`).result;
    assert.equal(support!.review, "yes");
    assert.equal(labelledQuotesFound(status, evidence, support), true);
    assert.equal(describeStatus(status as "verified", evidence, support).label, "Quotes found");
  });

  it("takes the label away when the check gives no readable verdict or fails (fails closed)", async () => {
    const { support, status, evidence } = await ask("I am not sure.").result;
    assert.equal(support!.review, "unclear");
    assert.equal(labelledQuotesFound(status, evidence, support), false);
    const shown = describeStatus(status as "verified", evidence, support);
    assert.equal(shown.label, "Quotes found, answer not confirmed");
    assert.match(shown.detail, /gave no clear reply/);

    // A server error during the check, not a stop by the user.
    const failing = new ScriptedModel([search, read, wrong]);
    const generate = failing.generate.bind(failing);
    failing.generate = (request) => {
      if (failing.requests.length === 3) throw new Error("Endpoint returned 500");
      return generate(request);
    };
    const failed = await runResearch({ question: QUESTION, library, model: failing });
    assert.equal(failed.support!.review, "unclear");
    assert.equal(labelledQuotesFound(failed.status, failed.evidence, failed.support), false);
  });

  const short = JSON.stringify({
    tool: "final_answer",
    args: { found: true, answer: "30 days", evidence: [{ docId: "mpl", quote: "if You become compliant prior to 30 days after Your receipt of the notice" }] },
  });

  it("asks Qwen3.5-4B about answers too short for the word checks, and labels them only on yes", async () => {
    for (const [reply, verdict, label] of [
      [`{"verdict":"yes"}`, "yes", "Quotes found"],
      [`{"verdict":"partly"}`, "partly", "Quotes found, answer not confirmed"],
    ] as const) {
      const model = new ScriptedModel([search, read, short, reply], "qwen3.5-4b-q4km");
      const { support, status, evidence } = await runResearch({ question: QUESTION, library, model });
      assert.equal(support!.judged, 0, "too short for the sentence check");
      assert.equal(model.requests.length, 4, "the check is asked");
      assert.equal(support!.review, verdict);
      assert.equal(labelledQuotesFound(status, evidence, support), verdict === "yes");
      const shown = describeStatus(status as "verified", evidence, support);
      assert.equal(shown.label, label);
      if (verdict === "yes") assert.match(shown.detail, /too short to compare with them word by word, but asked whether the quoted passages state it, the model said yes/);
    }
  });

  it("does not ask other models about short answers, which stay too short to check (Qwen3.5-2B)", async () => {
    for (const id of ["qwen3.5-2b-q4km", "Qwen3.5-2B-q4f16_1-MLC", "scripted"]) {
      const model = new ScriptedModel([search, read, short, `{"verdict":"yes"}`], id);
      const { support, status, evidence } = await runResearch({ question: QUESTION, library, model });
      assert.equal(model.requests.length, 3, `${id}: no check`);
      assert.equal(support!.review, undefined);
      assert.equal(labelledQuotesFound(status, evidence, support), false);
      assert.equal(describeStatus(status as "verified", evidence, support).label, "Quotes found, answer too short to check");
    }
    // Answers the word checks would label are still checked, whatever the model.
    const model = new ScriptedModel([search, read, wrong, `{"verdict":"partly"}`], "qwen3.5-2b-q4km");
    assert.equal((await runResearch({ question: QUESTION, library, model })).support!.review, "partly");
  });

  it("knows Qwen3.5-4B by the IDs the app and the benchmark use", () => {
    for (const id of ["Qwen3.5-4B-q4f16_1-MLC", "Qwen3.5-4B-q4f32_1-MLC", "Qwen3.5-4B-Q4_K_M.gguf", "qwen3.5-4b-q4km", "qwen3.5:4b", "unsloth/Qwen3.5-4B-GGUF"]) {
      assert.equal(reviewsShortAnswers(id), true, id);
    }
    for (const id of ["Qwen3.5-2B-q4f16_1-MLC", "qwen3.5-2b-q4km", "Qwen3.5-40B", "Qwen3-4B-q4f16_1-MLC", "llama-3.2-3b", "scripted"]) {
      assert.equal(reviewsShortAnswers(id), false, id);
    }
  });

  it("is not constrained when the agent runs unconstrained", async () => {
    const model = new ScriptedModel([search, read, wrong, `{"verdict":"yes"}`]);
    const { support } = await runResearch({ question: QUESTION, library, model, constrained: false });
    assert.equal(support!.review, "yes");
    assert.ok(model.requests.every((r) => !r.responseSchema));
  });

  it("does not ask about answers with a sentence no quote backs", async () => {
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
    assert.equal(labelledQuotesFound("verified", [{ verified: true }], { judged: 0, backed: 0 }), false, "short answers stay too short to check");
    assert.equal(
      describeStatus("verified", [{ verified: true }], { judged: 0, backed: 0 }).label,
      "Quotes found, answer too short to check",
    );
  });
});
