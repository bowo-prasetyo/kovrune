import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { answersAgree, crossCheckAnswer, extractionPrompt, parseExtracted } from "../src/agent/crosscheck.ts";
import { checkEvidence } from "../src/agent/evidence.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";

class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 4096 };
  readonly requests: GenerationRequest[] = [];
  private readonly reply: string | Error;
  constructor(reply: string | Error) {
    this.reply = reply;
  }
  supportsConstrainedDecoding() {
    return true;
  }
  async *generate(request: GenerationRequest) {
    this.requests.push(request);
    if (this.reply instanceof Error) throw this.reply;
    yield { text: this.reply, done: false };
    yield { text: "", done: true };
  }
  async dispose() {}
}

const SOURCE =
  "If You fail to comply, Your rights are reinstated provisionally, unless and until such Contributor explicitly and finally terminates Your grants, and on an ongoing basis, if such Contributor fails to notify You of the non-compliance by some reasonable means prior to 60 days after You have come back into compliance. Moreover, Your grants are reinstated on an ongoing basis if You cure the non-compliance within 30 days of receiving notice.";
const QUESTION = "How many days do you have to cure a violation after receiving notice under the MPL?";
const evidence = checkEvidence([{ docId: "mpl", quote: "prior to 60 days after You have come back into compliance" }], () => SOURCE);

describe("the cross-check of an answer (audit F2)", () => {
  it("compares the answer given with the one read in the passages, by numbers and words", () => {
    assert.equal(answersAgree("30 days", "You have 30 days after receiving notice."), true);
    assert.equal(answersAgree("30 days", "60 days."), false, "a number the answer does not give");
    assert.equal(answersAgree("Tessel Foundation", "LumenDB is maintained by the Tessel Foundation."), true);
    assert.equal(answersAgree("Tessel Foundation", "Harrow Labs maintains it."), false, "another name");
    assert.equal(answersAgree("1,5 Go", "La taille est de 1.5 Go."), true, "numbers compare as plain numbers");
    assert.equal(answersAgree("EUR 96,000; Jonas Feld", "The foundation spent EUR 96,000."), false, "half an answer to a two-part question");
    assert.equal(answersAgree("", "30 days"), false, "the model found no answer in the passages");
  });

  it("reads the extracted answer from the JSON reply, and nothing else", () => {
    assert.equal(parseExtracted('{"answer":" 30 days "}'), "30 days");
    assert.equal(parseExtracted('{"answer":""}'), "");
    assert.equal(parseExtracted("30 days"), undefined);
    assert.equal(parseExtracted('{"answer":30}'), undefined);
  });

  it("shows the model the question and the passages, never the answer it checks", async () => {
    const model = new ScriptedModel('{"answer":"60 days"}');
    const result = await crossCheckAnswer({ model, question: QUESTION, answer: "Thirty days, per the cure clause.", evidence, titleFor: () => "MPL-2.0" });
    assert.deepEqual(result, { extracted: "60 days", agrees: false });
    const prompt = model.requests[0]!.messages[1]!.content;
    assert.equal(prompt, extractionPrompt(QUESTION, evidence, () => "MPL-2.0"));
    assert.match(prompt, /^Question: How many days/);
    assert.match(prompt, /1\. From "MPL-2\.0": .*\[prior to 60 days after You have come back into compliance\.\]/);
    assert.doesNotMatch(prompt, /Thirty days|Answer:/);
    assert.ok(model.requests[0]!.responseSchema, "the reply is constrained to the JSON asked for");
  });

  it("does not agree when the reply cannot be read or the call fails", async () => {
    for (const reply of ["no idea", new Error("server error")]) {
      const result = await crossCheckAnswer({ model: new ScriptedModel(reply), question: QUESTION, answer: "60 days", evidence, titleFor: () => "MPL-2.0" });
      assert.deepEqual(result, { agrees: false });
    }
  });
});
