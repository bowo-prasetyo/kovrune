import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { answersAgree, crossCheckAnswer, extractionPrompt, parseExtracted, REPLY_CHARS } from "../src/agent/crosscheck.ts";
import { crossCheckFinding } from "../src/app/research/trace.ts";
import { checkEvidence } from "../src/agent/evidence.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";

class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 4096 };
  readonly requests: GenerationRequest[] = [];
  private readonly reply: string | Error;
  private readonly finishReason?: string;
  constructor(reply: string | Error, finishReason?: string) {
    this.reply = reply;
    this.finishReason = finishReason;
  }
  supportsConstrainedDecoding() {
    return true;
  }
  async *generate(request: GenerationRequest) {
    this.requests.push(request);
    if (this.reply instanceof Error) throw this.reply;
    yield { text: this.reply, done: false };
    yield { text: "", done: true, ...(this.finishReason ? { finishReason: this.finishReason } : {}) };
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
    // Answers in another form or writing system than the extracted one (field f31, f39).
    assert.equal(answersAgree("明", "现存的长城遗迹主要为始建于14世纪的明长城。"), true, "contained word for word");
    assert.equal(answersAgree("21,196.18千米", "21,196.18"), true, "an answer that is only a number: numbers decide");
    assert.equal(answersAgree("21,196.18千米", "21,196"), false);
    assert.equal(answersAgree("Ming", "1368"), false);
    assert.equal(answersAgree("明朝", "The Ming dynasty built it."), true, "another writing system: nothing to compare");
    assert.equal(answersAgree("1368年", "It was built in 1421."), false, "but numbers still count");
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
    assert.deepEqual(result, { extracted: "60 days", agrees: false, reply: '{"answer":"60 days"}' });
    const prompt = model.requests[0]!.messages[1]!.content;
    assert.equal(prompt, extractionPrompt(QUESTION, evidence, () => "MPL-2.0"));
    assert.match(prompt, /^Question: How many days/);
    assert.match(prompt, /1\. From "MPL-2\.0": .*\[prior to 60 days after You have come back into compliance\.\]/);
    assert.doesNotMatch(prompt, /Thirty days|Answer:/);
    assert.ok(model.requests[0]!.responseSchema, "the reply is constrained to the JSON asked for");
  });

  it("does not agree when the reply cannot be read or the call fails, and keeps the reason", async () => {
    const check = (model: ScriptedModel) => crossCheckAnswer({ model, question: QUESTION, answer: "60 days", evidence, titleFor: () => "MPL-2.0" });
    assert.deepEqual(await check(new ScriptedModel("no idea")), { agrees: false, reply: "no idea" });
    assert.deepEqual(await check(new ScriptedModel('{"answer":"fever, mild to moderate pain, migraine, tension', "length")), {
      agrees: false,
      reply: '{"answer":"fever, mild to moderate pain, migraine, tension',
      cutOff: true,
    });
    assert.deepEqual(await check(new ScriptedModel(new Error("server error"))), { agrees: false, failed: true });
    assert.deepEqual(await check(new ScriptedModel('{"answer":""}')), { extracted: "", agrees: false, reply: '{"answer":""}' });
    const long = await check(new ScriptedModel("x".repeat(1000)));
    assert.equal(long.reply, `${"x".repeat(REPLY_CHARS)}…`, "the saved reply is cut");
  });

  it("says in the label why it found no answer: none in the passages, a reply cut off or unreadable, or no call", () => {
    assert.equal(crossCheckFinding({ extracted: "30 days", agrees: false }), 'the model read "30 days"');
    assert.equal(crossCheckFinding({ extracted: "", agrees: false, reply: '{"answer":""}' }), "the model found no answer in them");
    assert.equal(
      crossCheckFinding({ agrees: false, reply: '{"answer":"fever, mild to moderate pain', cutOff: true }),
      'the model\'s reply was cut off at its length limit before it gave an answer: "{"answer":"fever, mild to moderate pain"',
    );
    assert.equal(crossCheckFinding({ agrees: false, reply: "Paracetamol treats pain." }), 'the model\'s reply could not be read as an answer: "Paracetamol treats pain."');
    assert.match(crossCheckFinding({ agrees: false, reply: "y".repeat(300) }), /: "y{120}…"$/);
    assert.equal(crossCheckFinding({ agrees: false, failed: true }), "the check could not be run: the model could not be asked");
    // Saved before the reply was kept: an empty answer was saved as "", an unreadable reply or a failed call as nothing.
    assert.equal(crossCheckFinding({ agrees: false }), "the model gave no reply that could be read");
  });
});
