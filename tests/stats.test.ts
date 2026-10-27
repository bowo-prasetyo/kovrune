import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Report, TaskResult } from "../eval/harness/benchmark.ts";
import { compareReports, formatComparison } from "../eval/harness/compare.ts";
import { formatRate, mcnemar, wilson } from "../eval/harness/stats.ts";

describe("benchmark statistics", () => {
  it("gives the Wilson interval of a rate", () => {
    const round = ([low, high]: [number, number]) => [Math.round(low * 1000) / 1000, Math.round(high * 1000) / 1000];
    // The false reassurance baseline in docs/design.md: 2 of 36 is somewhere from 1.5% to 18%.
    assert.deepEqual(round(wilson(2, 36)), [0.015, 0.181]);
    assert.deepEqual(round(wilson(0, 19)), [0, 0.168]);
    assert.deepEqual(round(wilson(47, 47)), [0.924, 1]);
    assert.deepEqual(wilson(0, 0), [0, 0]);
    assert.equal(formatRate(41, 47), "87% (75–94%)");
    assert.equal(formatRate(0, 0), "–");
  });

  it("gives the exact McNemar p-value of a paired comparison", () => {
    assert.equal(mcnemar(0, 0), 1);
    assert.equal(mcnemar(2, 0), 0.5);
    assert.equal(mcnemar(3, 1), 0.625);
    assert.equal(mcnemar(6, 0), 0.03125, "six to none is the first split below 0.05");
    assert.equal(mcnemar(0, 6), 0.03125, "the test is two-sided");
    assert.equal(mcnemar(5, 4), 1);
  });
});

const result = (suite: TaskResult["suite"], taskId: string, passed: boolean, actions = ["search"]): TaskResult => ({
  suite,
  taskId,
  kind: "lookup",
  mode: "constrained",
  passed,
  checks: {},
  stopReason: "final",
  calls: 1,
  validCalls: 1,
  promptTokens: 0,
  completionTokens: 0,
  estimatedTokens: false,
  modelMs: 0,
  ttftMs: 0,
  wallMs: 0,
  actions,
});

const report = (results: TaskResult[], cpu = "Intel Xeon @ 2.30GHz"): Report =>
  ({
    harnessVersion: "0.27.0",
    createdAt: "",
    complete: true,
    environment: { runtime: "local-endpoint", modelId: "qwen3.5-4b-q4km", contextLength: 4096, hardwareClass: "other", hardware: { cpu } },
    config: { suites: ["field", "holdout"], modes: ["constrained"] },
    summary: [],
    gate: { passed: false, criteria: [] },
    results,
  }) as Report;

describe("comparing two runs", () => {
  const before = report([
    result("field", "f01", true),
    result("field", "f02", false),
    result("field", "f03", true),
    result("holdout", "h01", false),
    result("holdout", "h02", true),
  ]);
  const after = report([
    result("field", "f01", true),
    result("field", "f02", true, ["read"]),
    result("field", "f03", false),
    result("holdout", "h01", true),
    result("holdout", "h02", true),
  ]);

  it("pairs tasks, names what was gained and lost, and tests the split", () => {
    const { suites, warnings } = compareReports(before, after);
    assert.deepEqual(warnings, []);
    const field = suites.find((s) => s.suite === "field")!;
    assert.deepEqual([field.before, field.after, field.tasks], [2, 2, 3]);
    assert.deepEqual([field.gained, field.lost], [["f02"], ["f03"]]);
    assert.equal(field.p, 1);
    assert.equal(field.sameActions, 2);
  });

  it("names held-out tasks only as counts", () => {
    const holdout = compareReports(before, after).suites.find((s) => s.suite === "holdout")!;
    assert.deepEqual([holdout.gainedCount, holdout.lostCount, holdout.gained, holdout.lost], [1, 0, [], []]);
    const text = formatComparison(compareReports(before, after));
    assert.match(text, /field gained: f02/);
    assert.doesNotMatch(text, /h01/);
  });

  it("warns when the runs are not comparable", () => {
    const elsewhere = report(after.results, "Intel Xeon @ 2.80GHz");
    assert.match(compareReports(before, elsewhere).warnings.join(" "), /different CPUs/);
    const failed = report([{ ...result("field", "f01", false), error: "fetch failed" }]);
    assert.match(compareReports(before, failed).warnings.join(" "), /stopped with an error: 0 before, 1 after/);
  });
});
