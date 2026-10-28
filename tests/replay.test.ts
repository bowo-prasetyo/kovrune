import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fingerprint, ReplayingModel, type RecordedCall } from "../src/agent/replay.ts";
import { RESEARCH_LIMITS, ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { describeProgress, resumability, TASK_ID, type SavedTask } from "../src/app/research/tasks.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";

/** A model that answers from a fixed list and counts its calls. */
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
    yield { text: "", done: true };
  }
  async dispose() {}
}

const library = () =>
  new ResearchLibrary([
    {
      id: "lumen-overview",
      title: "LumenDB project overview",
      text: "LumenDB is an embedded key-value store. Starting with version 3.0, the project is licensed under the Mozilla Public License 2.0 (MPL-2.0).",
    },
    { id: "cobble-overview", title: "Cobble overview", text: "Cobble is released under the Business Source License 1.1." },
  ]);

const QUESTION = "Which license does LumenDB use?";
const REPLIES = [
  JSON.stringify({ tool: "search", args: { query: "LumenDB license" } }),
  JSON.stringify({ tool: "read", args: { docId: "lumen-overview" } }),
  JSON.stringify({
    tool: "final_answer",
    args: { found: true, answer: "LumenDB uses MPL-2.0.", evidence: [{ docId: "lumen-overview", quote: "licensed under the Mozilla Public License 2.0" }] },
  }),
];

async function run(model: LanguageModel, question = QUESTION, lib = library()) {
  return runResearch({ question, library: lib, model });
}

describe("resuming a research task", () => {
  it("records every call with what the model saw", async () => {
    let recorded: RecordedCall[] = [];
    const result = await run(new ReplayingModel(new ScriptedModel(REPLIES), { onRecord: (calls) => (recorded = calls) }));
    assert.equal(result.status, "verified");
    assert.deepEqual(
      recorded.map((c) => c.output),
      REPLIES,
    );
    assert.ok(recorded.every((c) => /^[0-9a-f]{8}$/.test(c.input)));
    assert.equal(new Set(recorded.map((c) => c.input)).size, 3, "each step saw a different conversation");
  });

  it("continues where it stopped, with the same result and only the remaining model calls", async () => {
    let recorded: RecordedCall[] = [];
    const full = await run(new ReplayingModel(new ScriptedModel(REPLIES), { onRecord: (calls) => (recorded = calls) }));
    for (const stoppedAfter of [0, 1, 2, 3]) {
      const inner = new ScriptedModel(REPLIES.slice(stoppedAfter));
      const model = new ReplayingModel(inner, { replay: recorded.slice(0, stoppedAfter) });
      const resumed = await run(model);
      assert.equal(model.replayed, stoppedAfter, `stopped after ${stoppedAfter}`);
      assert.equal(inner.requests.length, 3 - stoppedAfter, `stopped after ${stoppedAfter}`);
      assert.deepEqual(resumed.final, full.final);
      assert.equal(resumed.status, full.status);
      assert.deepEqual(
        resumed.agent.calls.map((c) => c.tool),
        ["search", "read", "final_answer"],
      );
    }
  });

  it("hands over to the model where the conversation differs from the saved one", async () => {
    let recorded: RecordedCall[] = [];
    await run(new ReplayingModel(new ScriptedModel(REPLIES), { onRecord: (calls) => (recorded = calls) }));
    // The same steps over a library whose search results differ: the first step matches, the second doesn't.
    const changed = new ResearchLibrary([
      { id: "lumen-overview", title: "LumenDB project overview", text: "LumenDB changed its license to MPL-2.0 in version 3.0." },
      { id: "cobble-overview", title: "Cobble overview", text: "Cobble is released under the Business Source License 1.1." },
    ]);
    const inner = new ScriptedModel(REPLIES.slice(1));
    const model = new ReplayingModel(inner, { replay: recorded });
    await run(model, QUESTION, changed);
    assert.equal(model.replayed, 1);
    assert.equal(inner.requests.length, 2);

    // Another question: nothing matches.
    const other = new ReplayingModel(new ScriptedModel(REPLIES), { replay: recorded });
    await run(other, "Who maintains LumenDB?");
    assert.equal(other.replayed, 0);
  });

  it("replays a reply cut off at the length limit as cut off, so the task goes on as it did (audit N6)", async () => {
    // A runtime that reports a finish reason but no usage, and cuts the first answer off.
    class CuttingModel extends ScriptedModel {
      override async *generate(request: GenerationRequest) {
        this.requests.push(request);
        const cut = this.requests.length === 1;
        yield { text: cut ? '{"tool":"final_answer","args":{"found":true,"answer":"LumenDB uses' : REPLIES[2]!, done: false };
        yield { text: "", done: true, finishReason: cut ? "length" : "stop" };
      }
    }
    const lib = () => new ResearchLibrary([{ id: "lumen-overview", title: "LumenDB project overview", text: "LumenDB is licensed under the Mozilla Public License 2.0." }]);
    let recorded: RecordedCall[] = [];
    const full = await run(new ReplayingModel(new CuttingModel([]), { onRecord: (calls) => (recorded = calls) }), QUESTION, lib());
    // The cut-off answer, then the answer again with more room; later calls (the guard's read, the
    // model's check of its answer) stop normally.
    assert.deepEqual(recorded.slice(0, 2).map((c) => c.finishReason), ["length", "stop"]);
    assert.deepEqual(full.agent.calls.slice(0, 2).map((c) => c.cutOff), [true, undefined]);

    // Stopped after the cut-off reply: the retry is asked as before, so every later conversation is
    // the one the model saw the first time, and the saved replies would still fit it.
    const seen: string[] = [];
    class Fingerprinting extends ScriptedModel {
      override generate(request: GenerationRequest) {
        seen.push(fingerprint(request));
        return super.generate(request);
      }
    }
    const inner = new Fingerprinting(recorded.slice(1).map((c) => c.output));
    const model = new ReplayingModel(inner, { replay: recorded.slice(0, 1) });
    const resumed = await run(model, QUESTION, lib());
    assert.equal(model.replayed, 1);
    assert.deepEqual(seen, recorded.slice(1).map((c) => c.input));
    assert.equal(inner.requests[0]!.maxTokens, RESEARCH_LIMITS.cutOffMaxTokens, "with the room a cut-off reply gets");
    assert.deepEqual(resumed.final, full.final);
  });

  it("stops during replay like during a model call", async () => {
    const recorded: RecordedCall[] = [{ input: fingerprint({ messages: [] }), output: REPLIES[0]! }];
    const abort = new AbortController();
    abort.abort();
    const model = new ReplayingModel(new ScriptedModel([]), { replay: recorded });
    const generate = model.generate({ messages: [], maxTokens: 10, signal: abort.signal });
    await assert.rejects(() => generate[Symbol.asyncIterator]().next());
  });

  it("leaves the wrapped model to its owner", async () => {
    let disposed = false;
    const inner = new ScriptedModel([]);
    inner.dispose = async () => void (disposed = true);
    await new ReplayingModel(inner).dispose();
    assert.equal(disposed, false);
  });
});

describe("saved tasks", () => {
  const task: SavedTask = {
    id: TASK_ID,
    question: QUESTION,
    prefs: { wikipedia: false, language: "en", openalex: false },
    documentIds: ["a", "b"],
    setup: "Qwen3.5-4B on llama.cpp server",
    calls: [{ input: "00000000", output: "{}" }],
    steps: ["Searched"],
    startedAt: "2026-10-26T10:00:00.000Z",
    updatedAt: "2026-10-26T10:01:00.000Z",
  };

  it("continues only with the same documents and model setup", () => {
    assert.deepEqual(resumability(task, { documentIds: ["b", "a", "c"], setup: task.setup }), { resumable: true });
    assert.deepEqual(resumability(task, { documentIds: ["a"], setup: task.setup }), {
      resumable: false,
      reason: "a document it searched was removed",
    });
    assert.deepEqual(resumability(task, { documentIds: [], setup: task.setup }), {
      resumable: false,
      reason: "2 documents it searched were removed",
    });
    assert.deepEqual(resumability(task, { documentIds: ["a", "b"], setup: "Qwen3.5-2B in this browser" }), {
      resumable: false,
      reason: "it ran with Qwen3.5-4B on llama.cpp server",
    });
  });

  it("says how far it got", () => {
    assert.equal(describeProgress({ ...task, calls: [] }), "before its first step");
    assert.equal(describeProgress(task), "after 1 step");
    assert.equal(describeProgress({ ...task, calls: [...task.calls, ...task.calls] }), "after 2 steps");
  });
});
