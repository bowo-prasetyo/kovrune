// The report suite (docs/report-mode.md, slice 4): writes each report as the app does, planning it
// and researching each planned question in turn, and scores it against the sections its request
// should cover (eval/field/reports.ts, eval/harness/report-score.ts).
//
//   npm run bench:report -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km \
//     --build "llama.cpp fae9ac5, -DGGML_NATIVE=OFF, AVX2" --out eval/results/reports-qwen3.5-4b-q4km.json
//
// --suites reports,reportsholdout (the default) runs both; the held-out reports print no result as
// they run and are summed up only in totals, as the held-out suites are. A report already in --out is
// skipped, so a run can resume after an interruption.
//
// After the sections, the introduction and conclusion are written from them (src/agent/synthesis.ts,
// harness 0.53.0), and the share of their sentences the sections' verified quotes back is reported:
// the measurement decision R4 waits on. They do not change a section or its score.
//
// The planner is given the field documents, as the app gives it the user's documents, and plans from
// the request alone unless the source overview is on for the model (plansFromSources). --overview
// shows it the overview whatever the model (harness 0.52.0).

import { readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, totalmem } from "node:os";
import { parseArgs } from "node:util";
import { planReport } from "../src/agent/report.ts";
import { runResearch } from "../src/agent/research.ts";
import { synthesisBacking, writeSynthesis, type Synthesis, type SynthesisSection } from "../src/agent/synthesis.ts";
import { labelledQuotesFound } from "../src/agent/support.ts";
import { LocalEndpointModel } from "../src/models/local-endpoint.ts";
import { HARNESS_VERSION } from "./harness/benchmark.ts";
import { loadFieldSuite } from "./harness/field.ts";
import { scoreReport, sumScores, type ReportScore, type WrittenSection } from "./harness/report-score.ts";
import { reportHoldoutTasks, reportTasks, type ReportTask } from "./field/reports.ts";

const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://127.0.0.1:8080/v1" },
    model: { type: "string" },
    context: { type: "string", default: "4096" },
    "extra-body": { type: "string", default: '{"chat_template_kwargs":{"enable_thinking":false}}' },
    suites: { type: "string", default: "reports,reportsholdout" },
    tasks: { type: "string" },
    build: { type: "string" },
    notes: { type: "string" },
    out: { type: "string" },
    overview: { type: "boolean" },
    "long-reply-room": { type: "string" },
  },
});
if (!values.model) {
  console.error("Missing --model.");
  process.exit(1);
}

interface ReportResult {
  suite: "reports" | "reportsholdout";
  taskId: string;
  plan: { title: string; sections: string[]; fallback?: boolean; consulted?: string[] };
  planMs: number;
  sections: Array<
    WrittenSection & {
      evidence: number;
      verified: number;
      /** Replies cut off at their limit, the most tool results removed or shortened to fit, and cache use (harness 0.55.0). */
      cutOffs: number;
      droppedResults: number;
      promptTokens: number;
      cachedTokens?: number;
      promptMs?: number;
    }
  >;
  score: ReportScore;
  /** The introduction and conclusion, with their sentences checked; absent when fewer than two sections were answered or the reply could not be read. */
  synthesis?: Synthesis & { judged: number; backed: number; ms: number };
}
interface ReportRun {
  harnessVersion: string;
  createdAt: string;
  environment: Record<string, unknown>;
  results: ReportResult[];
}

const model = new LocalEndpointModel({
  baseUrl: values["base-url"],
  model: values.model,
  contextLength: Number(values.context),
  extraBody: JSON.parse(values["extra-body"]),
});
const field = await loadFieldSuite();
const suites = values.suites.split(",");
const wanted = (id: string) => !values.tasks || values.tasks.split(",").includes(id);
const queue: Array<[ReportResult["suite"], ReportTask]> = [
  ...(suites.includes("reports") ? reportTasks.map((t) => ["reports", t] as [ReportResult["suite"], ReportTask]) : []),
  ...(suites.includes("reportsholdout") ? reportHoldoutTasks.map((t) => ["reportsholdout", t] as [ReportResult["suite"], ReportTask]) : []),
].filter(([, t]) => wanted(t.id));

let run: ReportRun = {
  harnessVersion: HARNESS_VERSION,
  createdAt: new Date().toISOString(),
  environment: {
    runtime: "local-endpoint",
    modelId: values.model,
    contextLength: Number(values.context),
    hardware: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model, cpuCores: cpus().length, memoryGb: Math.round(totalmem() / 2 ** 30) },
    build: values.build,
    notes: values.notes,
    planner: values.overview ? "source overview" : "as the app plans",
  },
  results: [],
};
if (values.out) {
  try {
    run = JSON.parse(await readFile(values.out, "utf8")) as ReportRun;
  } catch {
    // A new run.
  }
}

for (const [suite, task] of queue) {
  if (run.results.some((r) => r.taskId === task.id)) continue;
  const held = suite === "reportsholdout";
  const started = Date.now();
  const plan = await planReport({ model, request: task.request, sources: ["your documents"], library: field.library, overview: values.overview });
  const planMs = Date.now() - started;
  const sections: ReportResult["sections"] = [];
  const checked: SynthesisSection[] = [];
  for (const question of plan.sections) {
    const began = Date.now();
    const result = await runResearch({ question, library: field.library, model, longReplyRoom: values["long-reply-room"] as "always" | "when-answering" | undefined });
    const calls = result.agent.calls;
    checked.push({ question, answer: result.final?.answer, status: result.status, evidence: result.evidence });
    sections.push({
      question,
      answer: result.final?.answer ?? "",
      quotesFound: labelledQuotesFound(result.status, result.evidence, result.support),
      status: result.status,
      calls: result.agent.calls.length,
      ms: Date.now() - began,
      evidence: result.evidence.length,
      verified: result.evidence.filter((e) => e.verified).length,
      cutOffs: calls.filter((c) => c.cutOff).length,
      droppedResults: Math.max(0, ...calls.map((c) => c.droppedResults ?? 0)),
      promptTokens: calls.reduce((n, c) => n + c.promptTokens, 0),
      ...(calls.length && calls.every((c) => c.cachedTokens !== undefined) ? { cachedTokens: calls.reduce((n, c) => n + c.cachedTokens!, 0) } : {}),
      ...(calls.length && calls.every((c) => c.promptMs !== undefined) ? { promptMs: calls.reduce((n, c) => n + c.promptMs!, 0) } : {}),
    });
  }
  const score = scoreReport(task, plan, sections);
  const synthesisStarted = Date.now();
  const written = await writeSynthesis({ model, title: plan.title, request: task.request, sections: checked, titleFor: (id) => field.library.documentFor(id)?.title });
  const synthesis = written && { ...written, ...synthesisBacking(written), ms: Date.now() - synthesisStarted };
  run.results.push({ suite, taskId: task.id, plan, planMs, sections, score, ...(synthesis ? { synthesis } : {}) });
  run.createdAt = new Date().toISOString();
  if (values.out) await writeFile(values.out, `${JSON.stringify(run, null, 2)}\n`);
  console.log(
    held
      ? `${task.id}: held out (${Math.round((Date.now() - started) / 60000)} min)`
      : `${task.id}: ${score.covered}/${score.expected} covered, ${score.right}/${score.matched} matched sections right, ${score.labelledWrong} labelled wrong, ${score.unmatched} unmatched, ${synthesis ? `introduction and conclusion ${synthesis.backed}/${synthesis.judged} sentences backed` : "no introduction or conclusion"} (${Math.round((Date.now() - started) / 60000)} min)`,
  );
}

for (const suite of ["reports", "reportsholdout"] as const) {
  const results = run.results.filter((r) => r.suite === suite);
  if (!results.length) continue;
  const t = sumScores(results.map((r) => r.score));
  const synth = results.flatMap((r) => (r.synthesis ? [r.synthesis] : []));
  const sumSynth = (key: "judged" | "backed" | "ms") => synth.reduce((n, x) => n + x[key], 0);
  const all = results.flatMap((r) => r.sections);
  const processed = all.reduce((n, s) => n + s.promptTokens - (s.cachedTokens ?? 0), 0);
  console.log(
    `\n${suite}: ${t.reports} reports, ${t.planned} sections planned (${t.fallbacks} fallbacks, ${t.joined} joining two things).` +
      `\n  Plan covers ${t.planCovered} of ${t.expected} expected sections; the report gives the facts of ${t.covered}.` +
      `\n  Matched sections: ${t.right} of ${t.matched} right; labelled Quotes found ${t.labelled}, ${t.labelledWrong} of them wrong.` +
      `\n  Unmatched sections: ${t.unmatched} (${t.unmatchedLabelled} labelled Quotes found).` +
      `\n  Introduction and conclusion: written for ${synth.length} of ${results.length} reports; ${sumSynth("backed")} of ${sumSynth("judged")} judged sentences backed by the sections' quotes (${Math.round(sumSynth("ms") / 1000)} s).` +
      `\n  Sections with a cut-off reply: ${all.filter((s) => s.cutOffs).length}; that had to fit: ${all.filter((s) => s.droppedResults).length}.` +
      `\n  Prompt tokens processed: ${processed} of ${all.reduce((n, s) => n + s.promptTokens, 0)} sent, in ${Math.round(all.reduce((n, s) => n + (s.promptMs ?? 0), 0) / 1000)} s.` +
      `\n  ${t.calls} calls, ${Math.round(t.ms / 60000)} min of sections.`,
  );
}
