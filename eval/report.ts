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
// The planner is given the field documents, as the app gives it the user's documents, and plans from
// the request alone unless the source overview is on for the model (plansFromSources). --overview
// shows it the overview whatever the model (harness 0.52.0).

import { readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, totalmem } from "node:os";
import { parseArgs } from "node:util";
import { planReport } from "../src/agent/report.ts";
import { runResearch } from "../src/agent/research.ts";
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
  sections: Array<WrittenSection & { evidence: number; verified: number }>;
  score: ReportScore;
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
  for (const question of plan.sections) {
    const began = Date.now();
    const result = await runResearch({ question, library: field.library, model });
    sections.push({
      question,
      answer: result.final?.answer ?? "",
      quotesFound: labelledQuotesFound(result.status, result.evidence, result.support),
      status: result.status,
      calls: result.agent.calls.length,
      ms: Date.now() - began,
      evidence: result.evidence.length,
      verified: result.evidence.filter((e) => e.verified).length,
    });
  }
  const score = scoreReport(task, plan, sections);
  run.results.push({ suite, taskId: task.id, plan, planMs, sections, score });
  run.createdAt = new Date().toISOString();
  if (values.out) await writeFile(values.out, `${JSON.stringify(run, null, 2)}\n`);
  console.log(
    held
      ? `${task.id}: held out (${Math.round((Date.now() - started) / 60000)} min)`
      : `${task.id}: ${score.covered}/${score.expected} covered, ${score.right}/${score.matched} matched sections right, ${score.labelledWrong} labelled wrong, ${score.unmatched} unmatched (${Math.round((Date.now() - started) / 60000)} min)`,
  );
}

for (const suite of ["reports", "reportsholdout"] as const) {
  const results = run.results.filter((r) => r.suite === suite);
  if (!results.length) continue;
  const t = sumScores(results.map((r) => r.score));
  console.log(
    `\n${suite}: ${t.reports} reports, ${t.planned} sections planned (${t.fallbacks} fallbacks, ${t.joined} joining two things).` +
      `\n  Plan covers ${t.planCovered} of ${t.expected} expected sections; the report gives the facts of ${t.covered}.` +
      `\n  Matched sections: ${t.right} of ${t.matched} right; labelled Quotes found ${t.labelled}, ${t.labelledWrong} of them wrong.` +
      `\n  Unmatched sections: ${t.unmatched} (${t.unmatchedLabelled} labelled Quotes found).` +
      `\n  ${t.calls} calls, ${Math.round(t.ms / 60000)} min of sections.`,
  );
}
