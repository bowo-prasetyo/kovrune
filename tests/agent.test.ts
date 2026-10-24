import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";
import { extractJson } from "../eval/harness/agent.ts";
import { evaluateGate, runBenchmark, summarize, type TaskResult } from "../eval/harness/benchmark.ts";
import { NodeCodeRunner } from "../eval/harness/sandbox.ts";
import { normalizeCode, runCodingTask, runResearchTask } from "../eval/harness/suites.ts";
import { CorpusIndex } from "../eval/harness/search.ts";
import { codingTasks } from "../eval/tasks/coding.ts";
import { corpus } from "../eval/tasks/corpus.ts";
import { researchTasks } from "../eval/tasks/research.ts";
import { referenceSolutions } from "./reference-solutions.ts";

/** A model that replays fixed replies and records the requests it received. */
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
    const text = this.replies.shift() ?? "{}";
    yield { text, done: false };
    yield { text: "", done: true, usage: { promptTokens: 100, completionTokens: 20 } };
  }

  async dispose() {}
}

const task = (id: string) => researchTasks.find((t) => t.id === id)!;

describe("research agent", () => {
  it("passes a task answered with a search, a read and a cited answer", async () => {
    const model = new ScriptedModel([
      `{"tool":"search","args":{"query":"LSA-2024-07 affected versions"}}`,
      `{"tool":"read","args":{"docId":"lumen-advisory-2024-07"}}`,
      `{"tool":"final_answer","args":{"found":true,"answer":"LumenDB 3.0.0 through 3.1.4 are affected.","citations":["lumen-advisory-2024-07"]}}`,
    ]);
    const run = await runResearchTask(task("r03-advisory-affected"), model, true);
    assert.equal(run.agent.stopReason, "final");
    assert.equal(run.score.passed, true);
    assert.equal(run.agent.calls.length, 3);
    assert.ok(model.requests.every((r) => r.responseSchema), "constrained mode sends a schema");
    // Tool results are shown to the model as untrusted data.
    assert.match(run.agent.transcript[3]!.content, /untrusted data/);
    assert.match(run.agent.transcript[5]!.content, /3\.1\.4/);
  });

  it("counts invalid replies and lets the model recover in unconstrained mode", async () => {
    const model = new ScriptedModel([
      `I will search for the license.`,
      `{"tool":"search","args":{}}`,
      "```json\n" + `{"tool":"final_answer","args":{"found":true,"answer":"MPL-2.0","citations":["lumen-overview"]}}` + "\n```",
    ]);
    const run = await runResearchTask(task("r02-lumen-license"), model, false);
    assert.equal(run.score.passed, true);
    assert.deepEqual(run.agent.calls.map((c) => c.valid), [false, false, true]);
    assert.ok(model.requests.every((r) => !r.responseSchema));
  });

  it("fails fabricated citations and wrong found flags", async () => {
    const fabricated = await runResearchTask(
      task("r02-lumen-license"),
      new ScriptedModel([`{"tool":"final_answer","args":{"found":true,"answer":"MPL-2.0","citations":["lumen-overview","made-up-doc"]}}`]),
      true,
    );
    assert.equal(fabricated.score.checks.citationsExist, false);
    assert.equal(fabricated.score.passed, false);

    const unanswerable = await runResearchTask(
      task("r22-harrow-ceo"),
      new ScriptedModel([`{"tool":"final_answer","args":{"found":true,"answer":"Jane Doe","citations":["harrow-press"]}}`]),
      true,
    );
    assert.equal(unanswerable.score.passed, false);

    const declined = await runResearchTask(
      task("r22-harrow-ceo"),
      new ScriptedModel([`{"tool":"final_answer","args":{"found":false,"answer":"The documents do not name a CEO.","citations":[]}}`]),
      true,
    );
    assert.equal(declined.score.passed, true);
  });

  it("stops at the call limit", async () => {
    const model = new ScriptedModel(Array(20).fill(`{"tool":"search","args":{"query":"LumenDB"}}`));
    const run = await runResearchTask(task("r01-lumen-maintainer"), model, true);
    assert.equal(run.agent.stopReason, "max-calls");
    assert.equal(run.agent.calls.length, 8);
    assert.equal(run.score.passed, false);
  });

  it("drops old tool results to stay within the context window", async () => {
    const model = new ScriptedModel([
      ...corpus.slice(0, 6).map((doc) => `{"tool":"read","args":{"docId":"${doc.id}"}}`),
      `{"tool":"final_answer","args":{"found":true,"answer":"Tessel Foundation","citations":["lumen-overview"]}}`,
    ]);
    Object.assign(model.info, { contextLength: 1600 });
    const run = await runResearchTask(task("r01-lumen-maintainer"), model, true);
    assert.equal(run.agent.stopReason, "final");
    assert.ok(run.agent.transcript.some((m) => m.content.includes("removed to save context")));
  });
});

describe("coding agent", () => {
  it("runs visible tests, then scores the submission on hidden tests", async () => {
    const coding = codingTasks.find((t) => t.id === "c06-fix-median")!;
    const fixed = referenceSolutions["c06-fix-median"]!;
    const model = new ScriptedModel([
      JSON.stringify({ tool: "run_tests", args: { code: coding.starterCode } }),
      JSON.stringify({ tool: "final_answer", args: { code: fixed } }),
    ]);
    const run = await runCodingTask(coding, model, true, new NodeCodeRunner());
    assert.match(run.agent.transcript[3]!.content, /FAIL median\(\[10, 2, 33, 4\]\)/);
    assert.equal(run.score.passed, true);
  });

  it("fails code that only passes the visible tests", async () => {
    const coding = codingTasks.find((t) => t.id === "c09-roman-to-int")!;
    const shortcut = `function romanToInt(s) { return s === "IV" ? 4 : s.length; }`;
    const model = new ScriptedModel([JSON.stringify({ tool: "final_answer", args: { code: shortcut } })]);
    const run = await runCodingTask(coding, model, true, new NodeCodeRunner());
    assert.equal(run.score.passed, false);
  });

  it("times out infinite loops", async () => {
    const run = await new NodeCodeRunner().run("function f() { while (true) {} }", [{ expr: "f()", expected: 1 }], 500);
    assert.match(run.error ?? "", /Timed out/);
  });

  it("strips fences and module syntax from submissions", () => {
    assert.equal(normalizeCode("```js\nexport function f() {}\n```").trim(), "function f() {}");
  });
});

describe("benchmark", () => {
  it("summarizes a run and evaluates the gate", async () => {
    const model = new ScriptedModel([
      `{"tool":"final_answer","args":{"found":true,"answer":"Tessel Foundation","citations":["lumen-overview"]}}`,
      `{"tool":"final_answer","args":{"found":true,"answer":"Apache-2.0","citations":["lumen-overview"]}}`,
    ]);
    const report = await runBenchmark({
      model,
      runner: new NodeCodeRunner(),
      environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
      config: { suites: ["research"], modes: ["constrained"], taskIds: ["r01-lumen-maintainer", "r02-lumen-license"] },
    });
    assert.equal(report.summary.length, 1);
    assert.equal(report.summary[0]!.passed, 1);
    assert.equal(report.summary[0]!.successRate, 0.5);
    assert.equal(report.gate.passed, false);
    assert.equal(report.gate.criteria.find((c) => c.name.startsWith("Research"))!.passed, false);
  });

  it("passes the gate when every threshold is met", () => {
    const result = (taskId: string, passed: boolean): TaskResult => ({
      suite: "research", taskId, kind: "lookup", mode: "constrained", passed, checks: {}, stopReason: "final",
      calls: 3, validCalls: 3, promptTokens: 3000, completionTokens: 300, estimatedTokens: false,
      modelMs: 12000, ttftMs: 2000, wallMs: 12500, actions: [],
    });
    const gate = evaluateGate(summarize([result("a", true), result("b", true), result("c", false)]));
    assert.equal(gate.passed, true, JSON.stringify(gate.criteria));
  });
});

describe("helpers", () => {
  it("extracts JSON from prose, fences and think blocks", () => {
    assert.deepEqual(extractJson('<think>hmm</think>Sure: {"a": {"b": 1}} done'), { a: { b: 1 } });
    assert.throws(() => extractJson("no json here"));
  });

  it("ranks the advisory first for an advisory query", () => {
    const hits = new CorpusIndex(corpus).search("LSA-2024-07 path traversal");
    assert.equal(hits[0]?.docId, "lumen-advisory-2024-07");
  });
});
