// Runs suites against one loaded model and produces a report with the M0 gate result.

import type { LanguageModel, Runtime } from "../../src/models/types.ts";
import { codingTasks } from "../tasks/coding.ts";
import { pdfTasks } from "../tasks/pdf.ts";
import { researchTasks, type ResearchTask } from "../tasks/research.ts";
import { unanswerableTasks } from "../tasks/unanswerable.ts";
import type { ResearchLibrary } from "../../src/agent/research.ts";
import type { CallRecord } from "../../src/agent/agent.ts";
import type { CodeRunner } from "./sandbox.ts";
import type { SelfCheckResult } from "../../src/agent/self-check.ts";
import { labelledQuotesFound } from "../../src/agent/support.ts";
import { ALL_SUITES, baseLibrary, runCodingTask, runResearchTask, type SuiteName, type TaskRun } from "./suites.ts";

export const HARNESS_VERSION = "0.17.0";

export type Mode = "constrained" | "unconstrained";

export type Preset = "full" | "quick";

/**
 * The quick preset covers every task kind in 8 tasks, for slow machines and
 * first checks. Only a complete full run can pass the gate.
 */
export const QUICK_TASK_IDS = [
  "r01-lumen-maintainer",
  "r03-advisory-affected",
  "r10-reporter-library",
  "r16-page-size-comparison",
  "r17-corrected-read",
  "r20-lumen-4-1-date",
  "c01-slugify",
  "c03-fix-chunk",
];

export interface BenchmarkConfig {
  suites: SuiteName[];
  modes: Mode[];
  /** Defaults to "full". Ignored when taskIds is set. */
  preset?: Preset;
  /** Run only these task IDs. */
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
  /** Research tasks: the answer's status (verified, unverified, not-found, no-answer). */
  status?: string;
  /** Research tasks: whether each quote was found in its document. */
  evidence?: Array<{ docId: string; verified: boolean; reason?: string }>;
  /** Research tasks: how many answer sentences were long enough to judge, and how many a found quote backs. */
  support?: { judged: number; backed: number };
  /** Research tasks: whether the app would label the answer "Quotes found". */
  quotesFound?: boolean;
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
  /**
   * Research suites: answers the app would label "Quotes found", and how many of those failed
   * their task. Their ratio is the false reassurance rate (docs/design.md §1.6).
   */
  falseReassurance?: { labelled: number; wrong: number };
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
  /** False when the run was stopped early; the interrupted task is not included. */
  complete: boolean;
  environment: Environment;
  config: BenchmarkConfig;
  selfCheck?: SelfCheckResult;
  /** Runs with the field suite: its committed and local task counts (local tasks make a run not comparable with others'). */
  field?: { committedTasks: number; localTasks: number; localDocuments: number };
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

/** Target for the false reassurance rate on Qwen3.5-4B (docs/design.md §1.6); reported, not part of the gate. */
export const FALSE_REASSURANCE_TARGET = 0.1;

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
    status: run.research?.status,
    evidence: run.research?.evidence.map(({ docId, verified, reason }) => ({ docId, verified, ...(reason ? { reason } : {}) })),
    ...(run.research
      ? {
          support: run.research.support && { judged: run.research.support.judged, backed: run.research.support.backed },
          quotesFound: labelledQuotesFound(run.research.status, run.research.evidence, run.research.support),
        }
      : {}),
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
    const labelled = group.filter((r) => r.quotesFound);
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
      ...(group.some((r) => r.quotesFound !== undefined)
        ? { falseReassurance: { labelled: labelled.length, wrong: labelled.filter((r) => !r.passed).length } }
        : {}),
    };
  });
}

/**
 * The false reassurance rate over the constrained research suites: of the answers labelled
 * "Quotes found", the share that failed their task. Undefined when no answer was so labelled.
 */
export function falseReassurance(summary: Summary[]): { labelled: number; wrong: number; rate?: number } {
  const counts = summary
    .filter((s) => s.mode === "constrained" && s.falseReassurance)
    .reduce((sum, s) => ({ labelled: sum.labelled + s.falseReassurance!.labelled, wrong: sum.wrong + s.falseReassurance!.wrong }), {
      labelled: 0,
      wrong: 0,
    });
  return { ...counts, ...(counts.labelled ? { rate: round(counts.wrong / counts.labelled, 3) } : {}) };
}

export function selectedTaskIds(config: BenchmarkConfig): string[] | undefined {
  return config.taskIds ?? (config.preset === "quick" ? QUICK_TASK_IDS : undefined);
}

/** Whether a run covers the whole evaluation set in both suites. */
export function isFullSetRun(config: BenchmarkConfig, complete: boolean): boolean {
  return complete && !selectedTaskIds(config) && ALL_SUITES.every((suite) => config.suites.includes(suite));
}

export function evaluateGate(summary: Summary[], fullSetRun: boolean): GateResult {
  const coverage: GateCriterion = {
    name: "Complete run of the full evaluation set",
    threshold: "all 46 tasks, all four suites",
    actual: fullSetRun ? "yes" : "no (subset, preset, or stopped early)",
    passed: fullSetRun,
  };
  const research = summary.find((s) => s.suite === "research" && s.mode === "constrained");
  if (!research) {
    return {
      passed: false,
      criteria: [coverage, { name: "Constrained research run", threshold: "present", actual: "missing", passed: false }],
    };
  }
  const constrained = summary.filter((s) => s.mode === "constrained");
  const validRate = Math.min(...constrained.map((s) => s.validActionRate));
  const decode = Math.min(...constrained.map((s) => s.decodeTokensPerSecond));
  const criteria: GateCriterion[] = [
    coverage,
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
  selfCheck?: SelfCheckResult;
  onResult?: (result: TaskResult, done: number, total: number) => void;
  onCall?: (call: CallRecord, index: number) => void;
  /** The base corpus plus the PDF documents; required for the pdf suite (see eval/tasks/pdf.ts). */
  pdfLibrary?: ResearchLibrary;
  /** Required for the field suite (see eval/harness/field.ts). */
  field?: { library: ResearchLibrary; tasks: ResearchTask[]; local: { tasks: number; documents: number } };
  /** Aborting ends the run early and still returns a (partial) report. */
  signal?: AbortSignal;
}): Promise<Report> {
  const { model, config, runner, signal, onCall } = options;
  const ids = selectedTaskIds(config);
  const wanted = (id: string) => !ids || ids.includes(id);
  const pick = (suite: SuiteName, tasks: ResearchTask[]) => (config.suites.includes(suite) ? tasks.filter((t) => wanted(t.id)) : []);
  const pdf = pick("pdf", pdfTasks);
  if (pdf.length && !options.pdfLibrary) throw new Error("The pdf suite needs pdfLibrary.");
  if (config.suites.includes("field") && !options.field) throw new Error("The field suite needs field (loadFieldSuite).");
  const field = config.suites.includes("field") && options.field ? options.field.tasks.filter((t) => wanted(t.id)) : [];
  const researchSuites = [
    { suite: "research" as const, tasks: pick("research", researchTasks), library: baseLibrary },
    { suite: "unanswerable" as const, tasks: pick("unanswerable", unanswerableTasks), library: baseLibrary },
    { suite: "pdf" as const, tasks: pdf, library: options.pdfLibrary ?? baseLibrary },
    { suite: "field" as const, tasks: field, library: options.field?.library ?? baseLibrary },
  ];
  const coding = config.suites.includes("coding") ? codingTasks.filter((t) => wanted(t.id)) : [];
  const total = (researchSuites.reduce((n, s) => n + s.tasks.length, 0) + coding.length) * config.modes.length;
  const results: TaskResult[] = [];

  const queue = config.modes.flatMap((mode) => [
    ...researchSuites.flatMap(({ suite, tasks, library }) =>
      tasks.map((task) => ({
        mode,
        run: (o: { constrained: boolean }) => runResearchTask(task, suite, library, model, { ...o, signal, onCall }),
      })),
    ),
    ...coding.map((task) => ({ mode, run: (o: { constrained: boolean }) => runCodingTask(task, model, runner, { ...o, signal, onCall }) })),
  ]);
  for (const item of queue) {
    if (signal?.aborted) break;
    const started = performance.now();
    const run = await item.run({ constrained: item.mode === "constrained" });
    // A task interrupted by the abort is incomplete, so it is left out of the report.
    if (signal?.aborted) break;
    results.push(toResult(run, item.mode, performance.now() - started));
    options.onResult?.(results.at(-1)!, results.length, total);
  }

  const complete = results.length === total;
  const summary = summarize(results);
  return {
    harnessVersion: HARNESS_VERSION,
    createdAt: new Date().toISOString(),
    complete,
    environment: options.environment,
    config,
    selfCheck: options.selfCheck,
    ...(options.field && config.suites.includes("field")
      ? {
          field: {
            committedTasks: options.field.tasks.length - options.field.local.tasks,
            localTasks: options.field.local.tasks,
            localDocuments: options.field.local.documents,
          },
        }
      : {}),
    summary,
    gate: evaluateGate(summary, isFullSetRun(config, complete)),
    results,
  };
}
