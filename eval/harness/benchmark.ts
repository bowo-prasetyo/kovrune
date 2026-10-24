// Runs suites against one loaded model and produces a report with the M0 gate result.

import type { LanguageModel, Runtime } from "../../src/models/types.ts";
import { codingTasks } from "../tasks/coding.ts";
import { researchTasks } from "../tasks/research.ts";
import type { CodeRunner } from "./sandbox.ts";
import { runCodingTask, runResearchTask, type SuiteName, type TaskRun } from "./suites.ts";

export const HARNESS_VERSION = "0.1.0";

export type Mode = "constrained" | "unconstrained";

export interface BenchmarkConfig {
  suites: SuiteName[];
  modes: Mode[];
  /** Run only these task IDs; all tasks when omitted. */
  taskIds?: string[];
}

export interface Environment {
  runtime: Runtime;
  modelId: string;
  contextLength: number;
  /** Reference hardware class from docs/m0-benchmark.md: "1", "2", "3", or "other". */
  hardwareClass: string;
  hardware: Record<string, unknown>;
  notes?: string;
}

export interface TaskResult {
  suite: SuiteName;
  taskId: string;
  kind: string;
  mode: Mode;
  passed: boolean;
  checks: Record<string, boolean>;
  stopReason: string;
  error?: string;
  calls: number;
  validCalls: number;
  promptTokens: number;
  completionTokens: number;
  estimatedTokens: boolean;
  /** Wall time spent in model calls. */
  modelMs: number;
  /** Time to first token, summed over calls. */
  ttftMs: number;
  wallMs: number;
  /** Each call's action, abbreviated, e.g. 'search {"query":"LumenDB"}' or 'invalid: ...'. */
  actions: string[];
  final?: string;
}

export interface Summary {
  suite: SuiteName;
  mode: Mode;
  tasks: number;
  passed: number;
  successRate: number;
  validActionRate: number;
  /** Completion tokens per second of generation time after the first token. */
  decodeTokensPerSecond: number;
  /** Prompt tokens per second of time to first token (includes prompt-cache effects). */
  prefillTokensPerSecond: number;
  medianTaskSeconds: number;
}

export interface GateCriterion {
  name: string;
  threshold: string;
  actual: string;
  passed: boolean;
}

export interface GateResult {
  passed: boolean;
  criteria: GateCriterion[];
}

export interface Report {
  harnessVersion: string;
  createdAt: string;
  environment: Environment;
  config: BenchmarkConfig;
  summary: Summary[];
  gate: GateResult;
  results: TaskResult[];
}

/** M0 go/no-go thresholds for a single model run (docs/m0-benchmark.md). */
export const GATE = {
  researchSuccessRate: 0.6,
  validActionRate: 0.95,
  decodeTokensPerSecond: 10,
  medianResearchTaskSeconds: 60,
};

function toResult(run: TaskRun, mode: Mode, wallMs: number): TaskResult {
  const calls = run.agent.calls;
  const final = run.agent.final;
  return {
    suite: run.suite,
    taskId: run.taskId,
    kind: run.kind,
    mode,
    passed: run.score.passed,
    checks: run.score.checks,
    stopReason: run.agent.stopReason,
    error: run.agent.error,
    calls: calls.length,
    validCalls: calls.filter((c) => c.valid).length,
    promptTokens: calls.reduce((s, c) => s + c.promptTokens, 0),
    completionTokens: calls.reduce((s, c) => s + c.completionTokens, 0),
    estimatedTokens: calls.some((c) => c.estimatedTokens),
    modelMs: Math.round(calls.reduce((s, c) => s + c.totalMs, 0)),
    ttftMs: Math.round(calls.reduce((s, c) => s + c.ttftMs, 0)),
    wallMs: Math.round(wallMs),
    actions: actionTrace(run),
    final: final ? JSON.stringify(final).slice(0, 600) : undefined,
  };
}

function actionTrace(run: TaskRun): string[] {
  return run.agent.calls.map((call) =>
    (call.valid ? `${call.tool} ${JSON.stringify(call.args)}` : `invalid: ${call.error ?? "unknown"}`).slice(0, 160),
  );
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

export function summarize(results: TaskResult[]): Summary[] {
  const groups = new Map<string, TaskResult[]>();
  for (const r of results) {
    const key = `${r.suite}/${r.mode}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((group) => {
    const calls = group.reduce((s, r) => s + r.calls, 0);
    const decodeMs = group.reduce((s, r) => s + Math.max(r.modelMs - r.ttftMs, 0), 0);
    const ttftMs = group.reduce((s, r) => s + r.ttftMs, 0);
    const passed = group.filter((r) => r.passed).length;
    return {
      suite: group[0]!.suite,
      mode: group[0]!.mode,
      tasks: group.length,
      passed,
      successRate: round(passed / group.length, 3),
      validActionRate: round(calls ? group.reduce((s, r) => s + r.validCalls, 0) / calls : 0, 3),
      decodeTokensPerSecond: round(decodeMs ? (group.reduce((s, r) => s + r.completionTokens, 0) / decodeMs) * 1000 : 0, 1),
      prefillTokensPerSecond: round(ttftMs ? (group.reduce((s, r) => s + r.promptTokens, 0) / ttftMs) * 1000 : 0, 1),
      medianTaskSeconds: round(median(group.map((r) => r.wallMs / 1000)), 1),
    };
  });
}

export function evaluateGate(summary: Summary[]): GateResult {
  const research = summary.find((s) => s.suite === "research" && s.mode === "constrained");
  if (!research) {
    return {
      passed: false,
      criteria: [{ name: "Constrained research run", threshold: "present", actual: "missing", passed: false }],
    };
  }
  const constrained = summary.filter((s) => s.mode === "constrained");
  const validRate = Math.min(...constrained.map((s) => s.validActionRate));
  const decode = Math.min(...constrained.map((s) => s.decodeTokensPerSecond));
  const criteria: GateCriterion[] = [
    {
      name: "Research task success (constrained)",
      threshold: `>= ${GATE.researchSuccessRate * 100}%`,
      actual: `${round(research.successRate * 100, 1)}%`,
      passed: research.successRate >= GATE.researchSuccessRate,
    },
    {
      name: "Valid action rate (constrained, all suites)",
      threshold: `>= ${GATE.validActionRate * 100}%`,
      actual: `${round(validRate * 100, 1)}%`,
      passed: validRate >= GATE.validActionRate,
    },
    {
      name: "Decode speed",
      threshold: `>= ${GATE.decodeTokensPerSecond} tokens/s`,
      actual: `${decode} tokens/s`,
      passed: decode >= GATE.decodeTokensPerSecond,
    },
    {
      name: "Median research task time",
      threshold: `<= ${GATE.medianResearchTaskSeconds} s`,
      actual: `${research.medianTaskSeconds} s`,
      passed: research.medianTaskSeconds <= GATE.medianResearchTaskSeconds,
    },
  ];
  return { passed: criteria.every((c) => c.passed), criteria };
}

export async function runBenchmark(options: {
  model: LanguageModel;
  environment: Environment;
  config: BenchmarkConfig;
  runner: CodeRunner;
  onResult?: (result: TaskResult, done: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<Report> {
  const { model, config, runner, signal } = options;
  const wanted = (id: string) => !config.taskIds || config.taskIds.includes(id);
  const research = config.suites.includes("research") ? researchTasks.filter((t) => wanted(t.id)) : [];
  const coding = config.suites.includes("coding") ? codingTasks.filter((t) => wanted(t.id)) : [];
  const total = (research.length + coding.length) * config.modes.length;
  const results: TaskResult[] = [];

  for (const mode of config.modes) {
    const constrained = mode === "constrained";
    for (const task of research) {
      signal?.throwIfAborted();
      const started = performance.now();
      const run = await runResearchTask(task, model, constrained, signal);
      results.push(toResult(run, mode, performance.now() - started));
      options.onResult?.(results.at(-1)!, results.length, total);
    }
    for (const task of coding) {
      signal?.throwIfAborted();
      const started = performance.now();
      const run = await runCodingTask(task, model, constrained, runner, signal);
      results.push(toResult(run, mode, performance.now() - started));
      options.onResult?.(results.at(-1)!, results.length, total);
    }
  }

  const summary = summarize(results);
  return {
    harnessVersion: HARNESS_VERSION,
    createdAt: new Date().toISOString(),
    environment: options.environment,
    config,
    summary,
    gate: evaluateGate(summary),
    results,
  };
}
