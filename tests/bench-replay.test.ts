import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runBenchmark } from "../eval/harness/benchmark.ts";
import { loadFieldSuite } from "../eval/harness/field.ts";
import { firstDifference, ReplayModel, replaysRecording } from "../eval/harness/replay.ts";
import { fingerprint } from "../src/agent/replay.ts";
import { NodeCodeRunner } from "../eval/harness/sandbox.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";

class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 4096 };
  private readonly replies: string[];
  constructor(replies: string[]) {
    this.replies = replies;
  }
  supportsConstrainedDecoding() {
    return true;
  }
  async *generate(_request: GenerationRequest) {
    yield { text: this.replies.shift() ?? "{}", done: false };
    yield { text: "", done: true, usage: { promptTokens: 100, completionTokens: 20 }, finishReason: "stop" };
  }
  async dispose() {}
}

const request = (content: string): GenerationRequest => ({ messages: [{ role: "user", content }], maxTokens: 64, temperature: 0 });

describe("recorded replies", () => {
  it("gives them back in order, logs what is asked, and says when the code asks for more", async () => {
    const replay = new ReplayModel({ id: "m", runtime: "scripted", contextLength: 4096 }, [{ input: fingerprint(request("a")), output: "one", finishReason: "length" }], true);
    const chunks = [];
    for await (const chunk of replay.generate({ ...request("a"), signal: new AbortController().signal })) chunks.push(chunk);
    assert.deepEqual(chunks, [{ text: "one", done: false }, { text: "", done: true, finishReason: "length" }]);
    assert.equal(replay.overran, false);
    for await (const chunk of replay.generate(request("b"))) assert.ok(chunk.done || chunk.text === "{}");
    assert.equal(replay.overran, true);
    assert.deepEqual(replay.requests[0], { messages: [{ role: "user", content: "a" }], maxTokens: 64, temperature: 0 }, "the signal is not part of the model's input");
  });

  it("checks that a replay asked for each recorded conversation", () => {
    const [a, b] = [request("a"), request("b")].map(({ signal: _, ...r }) => r);
    const calls = [{ input: fingerprint(a!), output: "x" }, { input: fingerprint(b!), output: "y" }];
    assert.equal(replaysRecording([a!, b!], calls), true);
    assert.equal(replaysRecording([a!, a!], calls), false, "another conversation");
    assert.equal(replaysRecording([a!], calls), false, "fewer requests than calls");
  });

  it("finds the first request two versions made differently", () => {
    const [a, b] = [request("a"), request("b")].map(({ signal: _, ...r }) => r);
    assert.equal(firstDifference([a!, b!], [a!, b!]), undefined);
    assert.equal(firstDifference([a!, b!], [a!, a!]), 1);
    assert.equal(firstDifference([a!], [a!, b!]), 1, "one more request is a difference");
  });
});

describe("replaying a benchmark task", () => {
  const answer = JSON.stringify({
    tool: "final_answer",
    args: { found: true, answer: "Hayashi Kogyo's phone number is 06-6341-2287.", evidence: [{ docId: "orders-2025", quote: "Customer: Hayashi Kogyo | Contact: Mai Hayashi | Phone: 06-6341-2287" }] },
  });
  // The search translates its terms into the library's other writing systems (two short model calls), as in a real run.
  const replies = [`{"tool":"search","args":{"query":"Hayashi Kogyo phone"}}`, "林工业 电话", "林工業 電話", `{"tool":"read","args":{"docId":"orders-2025"}}`, answer, answer];
  const environment = { runtime: "scripted" as const, modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} };
  const config = { suites: ["office" as const], modes: ["constrained" as const], taskIds: ["o09-hayashi-phone"] };

  it("records every reply of a run, and replays it on the same code with the same requests", async () => {
    const field = await loadFieldSuite();
    const report = await runBenchmark({ model: new ScriptedModel([...replies]), runner: new NodeCodeRunner(), field, environment, config });
    const recorded = report.results[0]!.replies!;
    // The agent's calls and the two translations, and after them any check of the answer (review.ts).
    assert.ok(recorded.length >= report.results[0]!.calls + 2, `${recorded.length} replies for ${report.results[0]!.calls} calls`);
    assert.deepEqual(recorded.slice(0, 4).map((r) => r.output), replies.slice(0, 4), "the agent's steps and the translations, in order");
    assert.ok(recorded.every((r) => /^[0-9a-f]{8}$/.test(r.input) && r.usage), "each with the conversation's fingerprint and the token counts");

    const replay = async (asSource?: boolean) => {
      const model = new ReplayModel({ id: environment.modelId, runtime: environment.runtime, contextLength: environment.contextLength }, recorded, true);
      const again = await runBenchmark({ model, runner: new NodeCodeRunner(), field, environment, config: { ...config, ...(asSource ? { asSource } : {}) } });
      return { model, result: again.results[0]! };
    };
    const [first, second] = [await replay(), await replay()];
    assert.equal(replaysRecording(first.model.requests, recorded), true, "each recorded conversation, asked for again");
    assert.equal(first.model.overran, false);
    assert.equal(firstDifference(first.model.requests, second.model.requests), undefined, "the same code makes the same requests");
    assert.deepEqual(first.result.actions, report.results[0]!.actions, "and the replay takes the recorded actions");

    // A change to what the model is shown: the documents served as an open source.
    const changed = await replay(true);
    assert.notEqual(firstDifference(first.model.requests, changed.model.requests), undefined, "a change to the model's input is found");
  });
});
