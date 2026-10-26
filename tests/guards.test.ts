import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runAgent } from "../src/agent/agent.ts";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { describeCall } from "../src/app/research/trace.ts";
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
const steps = (calls: Array<{ tool?: string; rejected?: boolean }>) => calls.map((c) => `${c.tool}${c.rejected ? " (rejected)" : ""}`);

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

  it("says in the trace that the model was sent back to read", () => {
    const call = { valid: true, tool: "final_answer", args: { found: false }, rejected: true, promptTokens: 0, completionTokens: 0, estimatedTokens: false, ttftMs: 0, totalMs: 0 };
    assert.match(describeCall(call, () => undefined), /reading what the search found first/);
  });
});
