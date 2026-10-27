import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";
import { z } from "zod";
import { extractJson, runAgent } from "../src/agent/agent.ts";
import { evaluateGate, falseReassurance, QUICK_TASK_IDS, runBenchmark, summarize, type TaskResult } from "../eval/harness/benchmark.ts";
import { formatCall, formatReport } from "../eval/harness/format.ts";
import { labelledQuotesFound } from "../src/agent/support.ts";
import { describeSelfCheck, runSelfCheck } from "../src/agent/self-check.ts";
import { loadNodePdfLibrary } from "../eval/harness/pdf-node.ts";
import { NodeCodeRunner } from "../eval/harness/sandbox.ts";
import { RESEARCH_LIMITS, ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { baseLibrary, normalizeCode, runCodingTask, runResearchTask } from "../eval/harness/suites.ts";
import { DocumentIndex, stem } from "../src/tools/search.ts";
import { codingTasks } from "../eval/tasks/coding.ts";
import { corpus } from "../eval/tasks/corpus.ts";
import { researchTasks } from "../eval/tasks/research.ts";
import { unanswerableTasks } from "../eval/tasks/unanswerable.ts";
import { referenceSolutions } from "./reference-solutions.ts";

/** A model that replays fixed replies and records the requests it received. */
class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 4096 };
  readonly requests: GenerationRequest[] = [];
  private readonly replies: string[];
  private readonly decodeDelayMs: number;

  constructor(replies: string[], decodeDelayMs = 0) {
    this.replies = [...replies];
    this.decodeDelayMs = decodeDelayMs;
  }

  supportsConstrainedDecoding() {
    return true;
  }

  async *generate(request: GenerationRequest) {
    this.requests.push(request);
    const text = this.replies.shift() ?? "{}";
    yield { text, done: false };
    if (this.decodeDelayMs) await new Promise((resolve) => setTimeout(resolve, this.decodeDelayMs));
    yield { text: "", done: true, usage: { promptTokens: 100, completionTokens: 20 } };
  }

  async dispose() {}
}

const task = (id: string) => researchTasks.find((t) => t.id === id)!;

/** A final_answer action with evidence. */
const final = (found: boolean, answer: string, evidence: Array<[string, string]> = []) =>
  JSON.stringify({ tool: "final_answer", args: { found, answer, evidence: evidence.map(([docId, quote]) => ({ docId, quote })) } });

const research = (taskId: string, replies: string[], constrained = true, model = new ScriptedModel(replies)) =>
  runResearchTask(task(taskId), "research", baseLibrary, model, { constrained });

const ADVISORY_QUOTE: [string, string] = ["lumen-advisory-2024-07", "Affected versions: LumenDB 3.0.0 through 3.1.4."];
const LICENSE_QUOTE: [string, string] = ["lumen-overview", "the project is licensed under the Mozilla Public License 2.0"];
const MAINTAINER_QUOTE: [string, string] = ["lumen-overview", "maintained by the Tessel Foundation since 2022"];

describe("research agent", () => {
  it("passes a task answered with a search, a read and a verified quote", async () => {
    const model = new ScriptedModel([
      `{"tool":"search","args":{"query":"LSA-2024-07 affected versions"}}`,
      `{"tool":"read","args":{"docId":"lumen-advisory-2024-07"}}`,
      final(true, "LumenDB 3.0.0 through 3.1.4 are affected.", [ADVISORY_QUOTE]),
    ]);
    const run = await research("r03-advisory-affected", [], true, model);
    assert.equal(run.agent.stopReason, "final");
    assert.equal(run.score.passed, true);
    assert.equal(run.research?.status, "verified");
    assert.equal(run.agent.calls.length, 3);
    assert.ok(model.requests.every((r) => r.responseSchema), "constrained mode sends a schema");
    // Tool results are shown to the model as untrusted data.
    assert.match(run.agent.transcript[3]!.content, /untrusted data/);
    assert.match(run.agent.transcript[5]!.content, /3\.1\.4/);
  });

  it("counts invalid replies and lets the model recover in unconstrained mode", async () => {
    const model = new ScriptedModel([`I will search for the license.`, `{"tool":"search","args":{}}`, "```json\n" + final(true, "MPL-2.0", [LICENSE_QUOTE]) + "\n```"]);
    const run = await research("r02-lumen-license", [], false, model);
    assert.equal(run.score.passed, true);
    assert.deepEqual(run.agent.calls.map((c) => c.valid), [false, false, true]);
    assert.ok(model.requests.every((r) => !r.responseSchema));
  });

  it("fails fabricated sources and wrong found flags, and passes a correct refusal", async () => {
    // A made-up document ID is rejected as an invalid action, constrained or not.
    const fabricated = await research("r02-lumen-license", [final(true, "MPL-2.0", [LICENSE_QUOTE, ["made-up-doc", "licensed under MPL-2.0"]])], false);
    assert.equal(fabricated.agent.calls[0]!.valid, false);
    assert.equal(fabricated.score.passed, false);

    const invented = await research("r22-harrow-ceo", [final(true, "Jane Doe", [["harrow-press", "Harrow Labs is headquartered in Rotterdam"]])]);
    assert.equal(invented.score.passed, false);

    const declined = await research("r22-harrow-ceo", [final(false, "The documents do not name a CEO.")]);
    assert.equal(declined.score.passed, true);
    assert.equal(declined.research?.status, "not-found");
  });

  it("fails a correct answer whose quote is not in the cited document", async () => {
    const run = await research("r02-lumen-license", [final(true, "MPL-2.0", [["lumen-overview", "LumenDB uses the MPL-2.0 license"]])]);
    assert.equal(run.score.checks.facts, true);
    assert.equal(run.score.checks.evidence, false);
    assert.equal(run.research?.status, "unverified");
    assert.equal(run.research?.evidence[0]?.reason, "quote not found in the document");
  });

  it("stops at the call limit", async () => {
    const run = await research("r01-lumen-maintainer", Array(20).fill(`{"tool":"search","args":{"query":"LumenDB"}}`));
    assert.equal(run.agent.stopReason, "max-calls");
    assert.equal(run.agent.calls.length, 8);
    assert.equal(run.score.passed, false);
  });

  it("drops old tool results to stay within the context window", async () => {
    const model = new ScriptedModel([
      ...corpus.slice(0, 6).map((doc) => `{"tool":"read","args":{"docId":"${doc.id}"}}`),
      final(true, "Tessel Foundation", [MAINTAINER_QUOTE]),
    ]);
    Object.assign(model.info, { contextLength: 1600 });
    const run = await research("r01-lumen-maintainer", [], true, model);
    assert.equal(run.agent.stopReason, "final");
    assert.ok(run.agent.transcript.some((m) => m.content.includes("removed to save context")));
  });
});

describe("repeat and last-step guards", () => {
  // A search that finds something must be followed by a read (next test), so these use searches that find nothing.
  it("takes search away after a repeated search, so the model reads instead of answering from snippets", async () => {
    const model = new ScriptedModel([
      `{"tool":"search","args":{"query":"qqqzz"}}`,
      `{"tool":"search","args":{"query":"qqqzz"}}`,
      `{"tool":"read","args":{"docId":"lumen-overview"}}`,
      final(true, "Tessel Foundation", [MAINTAINER_QUOTE]),
    ]);
    const run = await research("r01-lumen-maintainer", [], true, model);
    assert.equal(run.score.passed, true);
    assert.match(run.agent.transcript[5]!.content, /already ran this exact action[\s\S]*read one of the documents/);
    const schemaText = (i: number) => JSON.stringify(model.requests[i]!.responseSchema);
    assert.match(schemaText(1), /"search"/);
    assert.doesNotMatch(schemaText(2), /"search"/);
    assert.match(schemaText(2), /"read"/);
    assert.doesNotMatch(schemaText(3), /"search"/, "search stays unavailable for the rest of the task");
    assert.match(schemaText(3), /"read"/);
  });

  it("allows only final_answer after a second repeat", async () => {
    const model = new ScriptedModel([
      `{"tool":"search","args":{"query":"qqqzz"}}`,
      `{"tool":"search","args":{"query":"qqqzz"}}`,
      `{"tool":"read","args":{"docId":"lumen-overview"}}`,
      `{"tool":"read","args":{"docId":"lumen-overview"}}`,
      final(true, "Tessel Foundation", [MAINTAINER_QUOTE]),
    ]);
    const run = await research("r01-lumen-maintainer", [], true, model);
    assert.equal(run.score.passed, true);
    assert.match(run.agent.transcript.at(-2)!.content, /Finish now with final_answer/);
    assert.doesNotMatch(JSON.stringify(model.requests[4]!.responseSchema), /"search"|"read"/);
  });

  it("points to the other parts when a part of a long document is read twice", async () => {
    const text = Array.from({ length: 4 }, (_, i) => `Section ${i + 1}. ${"filler words here ".repeat(110)}`).join("\n\n");
    const library = new ResearchLibrary([{ id: "guide", title: "Guide", text }]);
    const [first, second] = library.index.partsOf("guide");
    const model = new ScriptedModel([
      `{"tool":"read","args":{"docId":"${first}"}}`,
      `{"tool":"read","args":{"docId":"${first}"}}`,
      `{"tool":"read","args":{"docId":"${second}"}}`,
      final(false, "Not there."),
    ]);
    const result = await runResearch({ question: "q", library, model });
    const observations = result.agent.transcript.filter((m) => m.role === "user").map((m) => m.content);
    assert.match(observations[2]!, /other parts: guide#2, guide#3/);
    assert.match(JSON.stringify(model.requests[2]!.responseSchema), /"read"/, "read stays available");
    assert.equal(result.status, "not-found");
  });

  it("allows only final_answer on the last call, so a run that keeps searching still ends with an answer", async () => {
    const searches = Array.from({ length: 7 }, (_, i) => `{"tool":"search","args":{"query":"qqqzz${"abcdefg"[i]}"}}`);
    const model = new ScriptedModel([...searches, final(false, "The documents do not say.")]);
    const run = await runResearchTask(
      unanswerableTasks.find((t) => t.id === "u06-lumen-stars")!,
      "unanswerable",
      baseLibrary,
      model,
      { constrained: true },
    );
    assert.equal(run.agent.stopReason, "final");
    assert.equal(run.score.passed, true);
    assert.match(run.agent.transcript.at(-2)!.content, /last step\. Finish now with final_answer/);
    const schemaText = (i: number) => JSON.stringify(model.requests[i]!.responseSchema);
    assert.match(schemaText(6), /"search"/);
    assert.doesNotMatch(schemaText(7), /"search"|"read"/);
  });

  it("rejects tools that are no longer allowed, in unconstrained mode too", async () => {
    const run = await research(
      "r01-lumen-maintainer",
      [`{"tool":"search","args":{"query":"qqqzz"}}`, `{"tool":"search","args":{"query":"qqqzz"}}`, `{"tool":"search","args":{"query":"other"}}`, final(false, "Not found.")],
      false,
    );
    assert.deepEqual(run.agent.calls.map((c) => c.valid), [true, true, false, true]);
    assert.match(run.agent.transcript[7]!.content, /one of these actions: read, final_answer/);
    assert.equal(run.research?.status, "not-found");
  });
});

describe("search before read", () => {
  it("makes the model read what a search found before searching again", async () => {
    // Class 1 live check: the model searched the Papyrus PDF five times with small rewordings
    // before reading it, spending 5 of its 8 steps.
    const model = new ScriptedModel([
      `{"tool":"search","args":{"query":"LumenDB maintainer"}}`,
      `{"tool":"read","args":{"docId":"lumen-overview"}}`,
      final(true, "Tessel Foundation", [MAINTAINER_QUOTE]),
    ]);
    const run = await research("r01-lumen-maintainer", [], true, model);
    assert.equal(run.score.passed, true);
    const schemaText = (i: number) => JSON.stringify(model.requests[i]!.responseSchema);
    assert.doesNotMatch(schemaText(1), /"search"/, "no second search before a read");
    assert.match(schemaText(1), /"read"[\s\S]*"final_answer"/);
    assert.match(schemaText(2), /"search"/, "search is back after the read");
  });

  it("still lets the model search again when a search found nothing", async () => {
    const model = new ScriptedModel([`{"tool":"search","args":{"query":"qqqzz"}}`, final(false, "Not found.")]);
    await research("r01-lumen-maintainer", [], true, model);
    assert.match(JSON.stringify(model.requests[1]!.responseSchema), /"search"/);
  });

  it("retries a reply cut off at the token limit with more room, then asks for a shorter one", async () => {
    // Class 1 preview check: with the PDF, Wikipedia and OpenAlex, Qwen3.5-2B's final answer hit
    // the 512-token limit six times in a row; "not a valid action" made it write the same again.
    // A cut-off answer may be right, so the retry first gets more room rather than less content.
    const replies = [`{"tool":"search","args":{"query":"x"}}`, `{"tool":"final_answer","args":{"answer":"long`, `{"tool":"final_answer","args":{"answer":"still long`, `{"tool":"final_answer","args":{"answer":"short"}}`];
    const requests: GenerationRequest[] = [];
    const model: LanguageModel = {
      info: { id: "m", runtime: "scripted", contextLength: 4096 },
      supportsConstrainedDecoding: () => true,
      dispose: async () => {},
      async *generate(request: GenerationRequest) {
        requests.push(request);
        const text = replies.shift()!;
        yield { text, done: false };
        yield { text: "", done: true, usage: { promptTokens: 100, completionTokens: text.endsWith("}") ? 10 : request.maxTokens } };
      },
    };
    const run = await runAgent({
      model,
      system: "s",
      task: "t",
      tools: [
        { name: "search", usage: "", args: z.object({ query: z.string() }).strict(), execute: async () => "ok" },
        { name: "final_answer", usage: "", args: z.object({ answer: z.string() }).strict() },
      ],
      finalTool: "final_answer",
      config: { constrained: true, maxCalls: 6, maxTokensPerCall: 64, cutOffMaxTokens: 128 },
    });
    assert.equal(run.stopReason, "final");
    assert.deepEqual(requests.map((r) => r.maxTokens), [64, 64, 128, 128]);
    assert.deepEqual(run.calls.map((c) => c.cutOff), [undefined, true, true, undefined]);
    assert.match(run.transcript[5]!.content, /cut off at the length limit[\s\S]*more room now: reply again with the same answer/);
    assert.match(run.transcript[7]!.content, /cut off at the length limit[\s\S]*Reply again, shorter/);
  });

  it("falls back to final_answer when no other tool is available", async () => {
    const model = new ScriptedModel([`{"tool":"search","args":{"query":"x"}}`, `{"tool":"final_answer","args":{}}`]);
    let searched = false;
    const run = await runAgent({
      model,
      system: "s",
      task: "t",
      tools: [
        { name: "search", usage: "", args: z.object({ query: z.string() }).strict(), execute: async () => ((searched = true), "ok"), available: () => !searched },
        { name: "final_answer", usage: "", args: z.object({}).strict(), available: () => false },
      ],
      finalTool: "final_answer",
      config: { constrained: true, maxCalls: 4, maxTokensPerCall: 64 },
    });
    assert.equal(run.stopReason, "final");
    assert.match(JSON.stringify(model.requests[1]!.responseSchema), /"final_answer"/);
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
    const run = await runCodingTask(coding, model, new NodeCodeRunner(), { constrained: true });
    assert.match(run.agent.transcript[3]!.content, /FAIL median\(\[10, 2, 33, 4\]\)/);
    assert.equal(run.score.passed, true);
  });

  it("fails code that only passes the visible tests", async () => {
    const coding = codingTasks.find((t) => t.id === "c09-roman-to-int")!;
    const shortcut = `function romanToInt(s) { return s === "IV" ? 4 : s.length; }`;
    const model = new ScriptedModel([JSON.stringify({ tool: "final_answer", args: { code: shortcut } })]);
    const run = await runCodingTask(coding, model, new NodeCodeRunner(), { constrained: true });
    assert.equal(run.score.passed, false);
  });

  it("summarizes visible test results and discards console output", async () => {
    const coding = codingTasks.find((t) => t.id === "c01-slugify")!;
    const noisy = `function slugify(t) { console.log("noise"); return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }`;
    const model = new ScriptedModel([
      JSON.stringify({ tool: "run_tests", args: { code: noisy } }),
      JSON.stringify({ tool: "final_answer", args: { code: noisy } }),
    ]);
    const run = await runCodingTask(coding, model, new NodeCodeRunner(), { constrained: true });
    assert.match(run.agent.transcript[3]!.content, /All 2 visible tests pass\./);
    assert.equal(run.score.passed, true);
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
      final(true, "Tessel Foundation", [MAINTAINER_QUOTE]),
      final(true, "Apache-2.0", [["lumen-overview", "released under the Apache-2.0 license until version 2.x"]]),
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

  it("counts wrong answers labelled Quotes found as false reassurance", async () => {
    const model = new ScriptedModel([
      final(true, "LumenDB is maintained by the Tessel Foundation.", [MAINTAINER_QUOTE]),
      // The model's own check of the answer (agent/review.ts).
      `{"verdict":"yes"}`,
      // A real quote, but the wrong license: the label would read "Quotes found", and the check confirms it too.
      final(true, "LumenDB is released under the Apache-2.0 license.", [["lumen-overview", "released under the Apache-2.0 license until version 2.x"]]),
      `{"verdict":"yes"}`,
    ]);
    const report = await runBenchmark({
      model,
      runner: new NodeCodeRunner(),
      environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
      config: { suites: ["research", "coding"], modes: ["constrained"], taskIds: ["r01-lumen-maintainer", "r02-lumen-license", "c01-slugify"] },
    });
    assert.deepEqual(
      report.results.map((r) => [r.taskId, r.passed, r.quotesFound]),
      [
        ["r01-lumen-maintainer", true, true],
        ["r02-lumen-license", false, true],
        ["c01-slugify", false, undefined],
      ],
    );
    assert.deepEqual(report.summary.find((s) => s.suite === "research")!.falseReassurance, { labelled: 2, wrong: 1 });
    assert.equal(report.summary.find((s) => s.suite === "coding")!.falseReassurance, undefined);
    assert.deepEqual(falseReassurance(report.summary), { labelled: 2, wrong: 1, rate: 0.5 });
    assert.match(formatReport(report), /1 of 2 answers labelled "Quotes found" failed their task, 50% \(9–91%\) \(target under 10%/);
  });

  it("does not count answers with missing quotes or unbacked sentences as reassuring", () => {
    const result = (taskId: string, quotesFound: boolean): TaskResult => ({
      suite: "research", taskId, kind: "lookup", mode: "constrained", passed: false, checks: {}, stopReason: "final",
      calls: 1, validCalls: 1, promptTokens: 0, completionTokens: 0, estimatedTokens: false,
      modelMs: 0, ttftMs: 0, wallMs: 0, actions: [], quotesFound,
    });
    const summary = summarize([result("a", false), result("b", false)]);
    assert.deepEqual(falseReassurance(summary), { labelled: 0, wrong: 0 });
    assert.equal(labelledQuotesFound("verified", [{ verified: true }, { verified: false }]), false);
    assert.equal(labelledQuotesFound("verified", [{ verified: true }], { judged: 3, backed: 2 }), false);
    assert.equal(labelledQuotesFound("verified", [{ verified: true }], { judged: 3, backed: 3 }), true);
    assert.equal(labelledQuotesFound("not-found", []), false);
  });

  it("runs the pdf suite on extracted PDFs, with quotes cited from a chunk", async () => {
    const pdfLibrary = await loadNodePdfLibrary();
    const chunks = pdfLibrary.index.partsOf("tessel-annual-report-2024");
    assert.equal(chunks.length, 2, "the annual report is split into chunks");
    const driftwoodChunk = chunks.find((id) => pdfLibrary.index.get(id)!.text.includes("Driftwood"))!;
    const model = new ScriptedModel([
      `{"tool":"search","args":{"query":"new project accepted November 2024"}}`,
      `{"tool":"read","args":{"docId":"${driftwoodChunk}"}}`,
      final(true, "Driftwood, a structured logging library for Rust applications.", [
        [driftwoodChunk, "accepted Driftwood, a structured logging library for Rust applications"],
      ]),
    ]);
    const report = await runBenchmark({
      model,
      runner: new NodeCodeRunner(),
      pdfLibrary,
      environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
      config: { suites: ["pdf"], modes: ["constrained"], taskIds: ["p02-new-project"] },
    });
    assert.equal(report.results[0]!.suite, "pdf");
    assert.equal(report.results[0]!.passed, true, JSON.stringify(report.results[0]!.checks));
    assert.equal(report.results[0]!.status, "verified");
  });

  it("refuses to run the pdf suite without its library", async () => {
    await assert.rejects(
      runBenchmark({
        model: new ScriptedModel([]),
        runner: new NodeCodeRunner(),
        environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
        config: { suites: ["pdf"], modes: ["constrained"] },
      }),
      /needs pdfLibrary/,
    );
  });

  it("passes the gate when every threshold is met", () => {
    const result = (taskId: string, passed: boolean): TaskResult => ({
      suite: "research", taskId, kind: "lookup", mode: "constrained", passed, checks: {}, stopReason: "final",
      calls: 3, validCalls: 3, promptTokens: 3000, completionTokens: 300, estimatedTokens: false,
      modelMs: 12000, ttftMs: 2000, wallMs: 12500, actions: [],
    });
    const summary = summarize([result("a", true), result("b", true), result("c", false)]);
    const gate = evaluateGate(summary, true);
    assert.equal(gate.passed, true, JSON.stringify(gate.criteria));
    // The same numbers from a subset or a stopped run cannot pass.
    assert.equal(evaluateGate(summary, false).passed, false);
  });

  it("runs only the quick preset's tasks and marks the gate as not applicable", async () => {
    const model = new ScriptedModel([]);
    const report = await runBenchmark({
      model,
      runner: new NodeCodeRunner(),
      environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
      config: { suites: ["research", "coding"], modes: ["constrained"], preset: "quick" },
    });
    assert.deepEqual(report.results.map((r) => r.taskId), QUICK_TASK_IDS);
    assert.equal(report.complete, true);
    assert.equal(report.gate.criteria[0]!.passed, false);
    // The quick preset covers every research task kind and both coding kinds.
    const kinds = new Set(report.results.map((r) => `${r.suite}:${r.kind}`));
    assert.equal(kinds.size, 7);
  });

  it("returns a partial report when stopped, leaving out the interrupted task", async () => {
    const controller = new AbortController();
    const model = new ScriptedModel(Array(40).fill(`{"tool":"search","args":{"query":"LumenDB"}}`));
    const calls: string[] = [];
    const report = await runBenchmark({
      model,
      runner: new NodeCodeRunner(),
      signal: controller.signal,
      environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
      config: { suites: ["research"], modes: ["constrained"], taskIds: ["r01-lumen-maintainer", "r02-lumen-license", "r03-advisory-affected"] },
      // Stop during the second task's third call.
      onCall: (call, index) => {
        calls.push(formatCall(call, index));
        if (calls.length === 8 + 3) controller.abort();
      },
    });
    assert.equal(report.complete, false);
    assert.deepEqual(report.results.map((r) => r.taskId), ["r01-lumen-maintainer"]);
    assert.equal(report.gate.passed, false);
    assert.match(calls[0]!, /^  call 1: search \{"query":"LumenDB"\} \(\d+\.\d s, [\d.]+ tok\/s\)$/);
  });
});

describe("self-check", () => {
  const search = `{"tool":"search","args":{"query":"LumenDB license"}}`;

  it("passes when the model acts on the tool result, measuring speed on the warm call", async () => {
    // 20 tokens in about 200 ms is about 100 tokens/s, so 8 calls of 512 tokens take about 41 s,
    // and each open source's 2 calls about 10 s more.
    // Bounds are loose because timers can fire slightly early or late on busy CI machines.
    const model = new ScriptedModel([search, `{"tool":"read","args":{"docId":"lumen-overview"}}`], 200);
    const steps: number[] = [];
    const result = await runSelfCheck(model, { onStep: (step) => steps.push(step) });
    assert.equal(result.passed, true);
    assert.equal(result.constrained, true);
    assert.equal(model.requests.length, 2);
    assert.deepEqual(steps, [1, 2]);
    // The second call sees the search result for the fixed query.
    assert.match(model.requests[1]!.messages.at(-1)!.content, /untrusted data[\s\S]*lumen-overview/);
    assert.ok(result.decodeTokensPerSecond > 50 && result.decodeTokensPerSecond < 120, String(result.decodeTokensPerSecond));
    assert.ok(result.maxResearchTaskMinutes >= 0.5 && result.maxResearchTaskMinutes <= 1.4, String(result.maxResearchTaskMinutes));
    assert.ok(result.minutesPerSource >= 0.1 && result.minutesPerSource <= 0.4, String(result.minutesPerSource));
    assert.match(describeSelfCheck(result).join("\n"), /up to [\d.]+ min at this speed, and up to [\d.]+ min more for each of Wikipedia and OpenAlex/);
  });

  it("estimates the worst case from the limits research runs with", async () => {
    // The estimate once assumed 256 tokens a call after research moved to 512 (harness 0.6.0).
    const model = new ScriptedModel([search, `{"tool":"read","args":{"docId":"lumen-overview"}}`], 200);
    const result = await runSelfCheck(model);
    const secondsPerCall = (result.maxResearchTaskMinutes * 60) / RESEARCH_LIMITS.maxCalls;
    assert.ok(secondsPerCall >= RESEARCH_LIMITS.maxTokensPerCall / result.decodeTokensPerSecond * 0.9, String(secondsPerCall));
    assert.ok(Math.abs(result.minutesPerSource - (RESEARCH_LIMITS.callsPerSource * secondsPerCall) / 60) <= 0.1);
  });

  it("fails on broken output and reports what the model produced", async () => {
    const model = new ScriptedModel(["\u0000\u0000 garbage"]);
    const result = await runSelfCheck(model);
    assert.equal(result.passed, false);
    assert.equal(result.failedStep, "first-action");
    assert.equal(model.requests.length, 1);
    assert.match(result.error ?? "", /no JSON object/);
    assert.match(describeSelfCheck(result).join("\n"), /FAILED[\s\S]*garbage[\s\S]*thinking is turned off/);
  });

  it("reports a cut-off second reply separately from ignoring the result", async () => {
    const result = await runSelfCheck(new ScriptedModel([search, `{"tool":"final_answer","args":{"found":true,"answer":"Lum`]));
    assert.equal(result.failedStep, "second-action");
    assert.doesNotMatch(describeSelfCheck(result).join("\n"), /not acting on tool results/);
  });

  it("fails when the model searches again instead of using the result", async () => {
    const result = await runSelfCheck(new ScriptedModel([search, `{"tool":"search","args":{"query":"LumenDB"}}`]));
    assert.equal(result.passed, false);
    assert.equal(result.failedStep, "uses-tool-result");
    assert.match(result.error ?? "", /searched again/);
    assert.match(describeSelfCheck(result).join("\n"), /not acting on tool results[\s\S]*llama\.cpp server/);
  });

  it("logs invalid calls with the model's output", () => {
    const line = formatCall(
      { valid: false, error: "no JSON object found", output: "Sure!", promptTokens: 10, completionTokens: 5, estimatedTokens: false, ttftMs: 500, totalMs: 1500 },
      2,
    );
    assert.equal(line, '  call 2: INVALID: no JSON object found. Output: "Sure!" (1.5 s, 5.0 tok/s)');
  });
});

describe("helpers", () => {
  it("extracts JSON from prose, fences and think blocks", () => {
    assert.deepEqual(extractJson('<think>hmm</think>Sure: {"a": {"b": 1}} done'), { a: { b: 1 } });
    assert.throws(() => extractJson("no json here"));
  });

  it("matches different word forms in search and snippets", () => {
    const hits = new DocumentIndex(corpus).search("Who maintains LumenDB?");
    assert.equal(hits[0]?.docId, "lumen-overview");
    assert.match(hits[0]!.snippet, /maintained by the Tessel Foundation/);
  });

  it("ranks the advisory first for an advisory query", () => {
    const hits = new DocumentIndex(corpus).search("LSA-2024-07 path traversal");
    assert.equal(hits[0]?.docId, "lumen-advisory-2024-07");
  });

  it("stems a word and its plural alike, also when it ends in s (field task f13)", () => {
    assert.deepEqual(["class", "classes"].map(stem), ["class", "class"]);
    assert.deepEqual(["access", "accesses", "process"].map(stem), ["access", "access", "process"]);
    assert.deepEqual(["license", "licenses", "maintains", "maintained"].map(stem), ["licens", "licens", "maintain", "maintain"]);
    const index = new DocumentIndex([
      { id: "classes", title: "Benchmarks", text: "Reference hardware classes for benchmarks: a laptop with 8 GB." },
      { id: "other", title: "Notes", text: "The reference for this note is the hardware store." },
    ]);
    assert.equal(index.search("Which hardware is reference class 1?")[0]?.docId, "classes");
  });

  it("finds a joined word by its parts, and a file by the name in its title (field task f06)", () => {
    const index = new DocumentIndex([
      { id: "guide", title: "kovrune-user-guide.md", text: "Start ./llama-server with -c 4096 for a 4,096-token context." },
      { id: "notes", title: "notes.txt", text: "The server in the notes runs on another port." },
      { id: "release", title: "LumenDB 3.2.0 release notes", text: "Version 3.2.0 fixes the bug." },
    ]);
    assert.equal(index.search("llama server context")[0]?.docId, "guide");
    assert.equal(index.search("user guide")[0]?.docId, "guide");
    // A dot between digits is part of the number: "3.2" does not find "3.2.0".
    assert.equal(index.search("3.2.0")[0]?.docId, "release");
    assert.equal(index.search("3.2").length, 0);
  });
});
