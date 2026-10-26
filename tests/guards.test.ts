import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runAgent } from "../src/agent/agent.ts";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { describeCall } from "../src/app/research/trace.ts";
import { mainScript } from "../src/documents/scripts.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";
import { createResearchTools, RESEARCH_SYSTEM } from "../src/tools/research.ts";
import { corpus } from "../eval/tasks/corpus.ts";

class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 4096 };
  readonly requests: GenerationRequest[] = [];
  private readonly replies: string[];
  constructor(replies: string[]) {
    this.replies = replies;
  }
  supportsConstrainedDecoding() {
    return true;
  }
  async *generate(request: GenerationRequest) {
    this.requests.push(request);
    yield { text: this.replies.shift() ?? "{}", done: false };
    yield { text: "", done: true, usage: { promptTokens: 100, completionTokens: 20 } };
  }
  async dispose() {}
}

const library = new ResearchLibrary(corpus);
const search = (query: string) => JSON.stringify({ tool: "search", args: { query } });
const read = (docId: string) => JSON.stringify({ tool: "read", args: { docId } });
const notFound = JSON.stringify({ tool: "final_answer", args: { found: false, answer: "The documents do not say.", evidence: [] } });
const steps = (calls: Array<{ tool?: string; rejected?: string }>) => calls.map((c) => `${c.tool}${c.rejected ? " (rejected)" : ""}`);

describe("read before not found", () => {
  it("sends a not-found answer back once when the search found documents that were not read (field f19, f30)", async () => {
    const model = new ScriptedModel([search("LumenDB maintainer"), notFound, read("lumen-overview"), notFound]);
    const result = await runResearch({ question: "Who maintains LumenDB?", library, model });
    assert.deepEqual(steps(result.agent.calls), ["search", "final_answer (rejected)", "read", "final_answer"]);
    assert.equal(result.agent.stopReason, "final");
    assert.equal(result.status, "not-found", "after reading, the model may still conclude that the answer is not there");
    // system, question, search, its result, the rejected answer, then the objection the read follows.
    assert.equal(result.agent.transcript[5]!.role, "user");
    assert.match(result.agent.transcript[5]!.content, /read what your search found: each snippet is only one sentence/);
  });

  it("asks only once", async () => {
    // The model ignores the request and concludes again without reading: the second answer stands.
    const model = new ScriptedModel([search("LumenDB maintainer"), notFound, notFound]);
    const result = await runResearch({ question: "Who maintains LumenDB?", library, model });
    assert.deepEqual(steps(result.agent.calls), ["search", "final_answer (rejected)", "final_answer"]);
    assert.equal(result.status, "not-found");
  });

  it("lets not-found through when the search found nothing, or after a read", async () => {
    const nothing = await runResearch({ question: "q", library, model: new ScriptedModel([search("zzzqqq"), notFound]) });
    assert.deepEqual(steps(nothing.agent.calls), ["search", "final_answer"]);
    const afterRead = await runResearch({
      question: "q",
      library,
      model: new ScriptedModel([search("LumenDB maintainer"), read("lumen-overview"), notFound]),
    });
    assert.deepEqual(steps(afterRead.agent.calls), ["search", "read", "final_answer"]);
  });

  it("does not object to an answer that was found, or on the last step", async () => {
    const found = JSON.stringify({
      tool: "final_answer",
      args: { found: true, answer: "The Tessel Foundation maintains LumenDB.", evidence: [{ docId: "lumen-overview", quote: "maintained by the Tessel Foundation since 2022" }] },
    });
    const answered = await runResearch({ question: "Who maintains LumenDB?", library, model: new ScriptedModel([search("LumenDB maintainer"), found]) });
    assert.deepEqual(steps(answered.agent.calls), ["search", "final_answer"]);

    const lastStep = await runAgent({
      model: new ScriptedModel([search("LumenDB maintainer"), notFound]),
      system: RESEARCH_SYSTEM,
      task: "Who maintains LumenDB?",
      tools: createResearchTools(library.index),
      finalTool: "final_answer",
      config: { constrained: true, maxCalls: 2, maxTokensPerCall: 512 },
    });
    assert.equal(lastStep.stopReason, "final", "with no steps left, the model must be able to finish");
    assert.deepEqual(steps(lastStep.calls), ["search", "final_answer"]);
  });

  it("says in the trace that the model was sent back to read", async () => {
    const result = await runResearch({
      question: "Who maintains LumenDB?",
      library,
      model: new ScriptedModel([search("LumenDB maintainer"), notFound, read("lumen-overview"), notFound]),
    });
    assert.match(describeCall(result.agent.calls[1]!, () => undefined), /reading what the search found first/);
    const call = { valid: true, tool: "final_answer", args: { found: false }, rejected: "a step", promptTokens: 0, completionTokens: 0, estimatedTokens: false, ttftMs: 0, totalMs: 0 };
    assert.equal(describeCall(call, () => undefined), "a step");
  });
});

describe("reply in the question's language", () => {
  const fuji = new ResearchLibrary([{ id: "fuji", title: "富士山", text: "富士山は日本の活火山である。山体の最高地点は3776.12 mである。" }]);
  const answer = (text: string, found = true) =>
    JSON.stringify({ tool: "final_answer", args: { found, answer: text, evidence: found ? [{ docId: "fuji", quote: "山体の最高地点は3776.12 mである。" }] : [] } });
  const ask = (replies: string[]) =>
    runResearch({ question: "富士山の山体の最高地点は何メートルですか？", library: fuji, model: new ScriptedModel([search("富士山 最高地点"), read("fuji"), ...replies]) });

  it("tells writing systems apart, by weight", () => {
    assert.deepEqual(mainScript("The provided documents do not say."), { script: "Latin", weight: 28 });
    assert.equal(mainScript("山梨県と静岡県")!.script, "Chinese or Japanese");
    assert.equal(mainScript("Москва")!.script, "Cyrillic");
    assert.equal(mainScript("1987"), undefined);
  });

  it("sends an English answer to a Japanese question back once (field f28)", async () => {
    const english = answer("The highest point of Mount Fuji is 3776.12 m.");
    const result = await ask([english, answer("富士山の最高地点は3776.12 mです。")]);
    assert.deepEqual(steps(result.agent.calls), ["search", "read", "final_answer (rejected)", "final_answer"]);
    assert.match(result.agent.transcript.at(-2)!.content, /written in Chinese or Japanese script, but your answer is in Latin script.*keep each quote exactly/);
    assert.match(describeCall(result.agent.calls[2]!, () => undefined), /another language than the question/);
    assert.equal(result.final!.answer, "富士山の最高地点は3776.12 mです。");
    assert.equal(result.status, "verified");

    const again = await ask([english, english]);
    assert.deepEqual(steps(again.agent.calls), ["search", "read", "final_answer (rejected)", "final_answer"], "asked once");
  });

  it("checks not-found answers too, but not short ones or answers in the question's script", async () => {
    const notFoundEnglish = await ask([answer("The provided documents do not contain this information.", false), answer("文書には記載がありません。", false)]);
    assert.deepEqual(steps(notFoundEnglish.agent.calls), ["search", "read", "final_answer (rejected)", "final_answer"]);
    for (const text of ["3776.12 m", "3776.12メートルです。"]) {
      const result = await ask([answer(text)]);
      assert.deepEqual(steps(result.agent.calls), ["search", "read", "final_answer"], text);
    }
  });

  it("leaves English questions, and French ones, alone", async () => {
    const english = await runResearch({
      question: "Who maintains LumenDB?",
      library,
      model: new ScriptedModel([
        search("LumenDB maintainer"),
        read("lumen-overview"),
        JSON.stringify({ tool: "final_answer", args: { found: true, answer: "LumenDB is maintained by the Tessel Foundation.", evidence: [{ docId: "lumen-overview", quote: "maintained by the Tessel Foundation since 2022" }] } }),
      ]),
    });
    assert.deepEqual(steps(english.agent.calls), ["search", "read", "final_answer"]);
    // A limit: French and English share the Latin script, so an English answer to a French question passes.
    assert.equal(mainScript("Quelle est la hauteur de la tour Eiffel ?")!.script, mainScript("The tower is 330 m tall.")!.script);
  });
});
