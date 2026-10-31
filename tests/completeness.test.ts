import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkCompleteness, completenessPrompt, coversEveryPart, parseParts } from "../src/agent/completeness.ts";
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

const QUESTION = 'The user guide calls Ollama experimental. What went wrong with it in testing, and what does the troubleshooting table suggest using instead?';
const HALF = "Use llama.cpp server with the same model file.";
const WHOLE = "Some versions repeated the same step instead of answering. Use llama.cpp server with the same model file.";
const reply = (parts: Array<[string, string]>) => JSON.stringify({ parts: parts.map(([asks, answer]) => ({ asks, answer })) });

describe("the completeness check (audit N2)", () => {
  it("passes an answer that gives every part, and not one that leaves a part out", () => {
    const parts = parseParts(reply([["what went wrong", "repeated the same step"], ["what to use instead", "llama.cpp server"]]))!;
    assert.equal(coversEveryPart(parts, WHOLE), true);
    assert.equal(coversEveryPart(parts, HALF), false, "the words for the first part are not in the answer");
    assert.equal(coversEveryPart(parseParts(reply([["what went wrong", ""], ["what to use instead", "llama.cpp server"]]))!, HALF), false, "a part the model says is missing");
    assert.equal(coversEveryPart([], WHOLE), false, "no parts: nothing was read");
  });

  it("compares the words as the cross-check does: word for word, or numbers and half the words", () => {
    assert.equal(coversEveryPart([{ asks: "size", answer: "2.4 GB" }], "The download is 2.4 GB."), true);
    assert.equal(coversEveryPart([{ asks: "size", answer: "2.6 GB" }], "The download is 2.4 GB."), false, "a number the answer does not give");
  });

  it("reads the parts from the JSON reply, and nothing else", () => {
    assert.deepEqual(parseParts(reply([[" size ", " 2.4 GB "]])), [{ asks: "size", answer: "2.4 GB" }]);
    assert.equal(parseParts('{"parts":[]}'), undefined);
    assert.equal(parseParts('{"parts":[{"asks":"size"}]}'), undefined);
    assert.equal(parseParts("2.4 GB"), undefined);
  });

  it("shows the model the question and the answer, never the passages", async () => {
    const model = new ScriptedModel(reply([["what went wrong", ""], ["what to use instead", "llama.cpp server"]]));
    const result = await checkCompleteness({ model, question: QUESTION, answer: HALF });
    assert.equal(result.complete, false);
    const prompt = model.requests[0]!.messages[1]!.content;
    assert.equal(prompt, completenessPrompt(QUESTION, HALF));
    assert.match(prompt, /^Question: The user guide/);
    assert.match(prompt, /\nAnswer: Use llama\.cpp server/);
    assert.doesNotMatch(prompt, /passage/i);
    assert.ok(model.requests[0]!.responseSchema, "the reply is constrained to the JSON asked for");
  });

  it("fails closed when the reply cannot be read or the call fails", async () => {
    for (const r of ["no idea", new Error("server error")]) {
      assert.deepEqual(await checkCompleteness({ model: new ScriptedModel(r), question: QUESTION, answer: WHOLE }), { complete: false });
    }
  });
});
