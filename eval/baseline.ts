// False reassurance across every suite, on today's label rules, without a model (design §1.6):
//
//   npm run bench:baseline                 # a Markdown table, one row per suite and model
//   npm run bench:baseline -- --json       # the same figures as JSON
//
// For each suite and catalog model (Qwen3.5-2B and 4B), it takes the latest recorded run in eval/results/
// that answered nearly all of the suite's tasks in constrained mode (the app's), and re-scores its answers
// with the current quote check, sentence support and label rule (eval/rescore-core.ts). False reassurance
// is the share of answers labelled Quotes found ("Backed by quotes") whose task fails.
//
// What this is not: a fresh model run. The answers are what the model wrote under the harness version of
// each run, often many versions old; only the checking and labelling are today's. A change to prompts,
// search or reading since then is not reflected, and the model's own checks (review, cross-check,
// completeness) are not asked again. Each row names the run and its version, so its age is visible.
// A run whose quotes were verified when recorded but are no longer found in today's documents (the
// suite's documents changed since) can't be checked this way: the newest run with at most 5% such
// answers is taken instead, and the count is shown.

import { readdir, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { HARNESS_VERSION, type Report, type TaskResult } from "./harness/benchmark.ts";
import { loadRescoreSuites, rescoreResult } from "./rescore-core.ts";

const { values } = parseArgs({ options: { json: { type: "boolean" }, results: { type: "string", default: "eval/results" } } });

/** A run counts for a suite when it answered at least this share of the suite's tasks. */
const MIN_COVERAGE = 0.9;
/** The most of a run's answers that may have lost quotes verified when recorded. */
const MAX_STALE = 0.05;
/** Ablations recorded next to a run at the same version (a note, an outline text or the cache turned off). */
const ABLATION = /(^|-)no(note|setext|cache|slot)(-|$)|-base-/;

const MODELS: Record<string, string> = { "qwen3.5-2b": "Qwen3.5-2B", "qwen3.5-4b": "Qwen3.5-4B" };
const modelOf = (id: string) => MODELS[id.replace(/-q4km$/, "")];

const version = (v: string) => v.split(".").map(Number);
function newer(a: Report, b: Report): boolean {
  const [x, y] = [version(a.harnessVersion), version(b.harnessVersion)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) > (y[i] ?? 0);
  return a.createdAt > b.createdAt;
}

const suites = await loadRescoreSuites();
const runs: Array<{ file: string; report: Report }> = [];
for (const file of (await readdir(values.results!)).filter((f) => f.endsWith(".json")).sort()) {
  if (ABLATION.test(file)) continue;
  try {
    const report = JSON.parse(await readFile(`${values.results}/${file}`, "utf8")) as Report;
    if (Array.isArray(report.results) && modelOf(report.environment?.modelId ?? "")) runs.push({ file, report });
  } catch {
    // not JSON, or not a report
  }
}

interface Row {
  suite: string;
  heldOut: boolean;
  model: string;
  file: string;
  harness: string;
  tasks: number;
  rescored: number;
  cut: number;
  right: number;
  labelled: number;
  wrong: number;
  recordedLabelled: number;
  recordedWrong: number;
  /** Answers whose quotes were all verified when recorded, and are not now. */
  stale: number;
}

const rows: Row[] = [];
for (const [suite, { tasks }] of Object.entries(suites)) {
  for (const model of Object.values(MODELS)) {
    const candidates: Array<{ file: string; report: Report; results: TaskResult[] }> = [];
    for (const { file, report } of runs) {
      if (modelOf(report.environment.modelId) !== model) continue;
      const results = report.results.filter((r) => r.suite === suite && r.mode === "constrained");
      const answered = new Set(results.map((r) => r.taskId).filter((id) => tasks.some((t) => t.id === id)));
      if (answered.size >= tasks.length * MIN_COVERAGE) candidates.push({ file, report, results });
    }
    candidates.sort((a, b) => (newer(a.report, b.report) ? -1 : 1));
    for (const run of candidates) {
      const row = score(suite, model, tasks.length, run);
      if (row.stale <= row.rescored * MAX_STALE) {
        rows.push(row);
        break;
      }
    }
  }
}

function score(suite: string, model: string, taskCount: number, best: { file: string; report: Report; results: TaskResult[] }): Row {
  const row: Row = {
    suite,
    heldOut: suite.endsWith("holdout"),
    model,
    file: best.file,
    harness: best.report.harnessVersion,
    tasks: taskCount,
    rescored: 0,
    cut: 0,
    right: 0,
    labelled: 0,
    wrong: 0,
    recordedLabelled: 0,
    recordedWrong: 0,
    stale: 0,
  };
  // One answer per task: the first recorded, as a run answers each task once per mode.
  const seen = new Set<string>();
  for (const result of best.results) {
    if (seen.has(result.taskId)) continue;
    seen.add(result.taskId);
    if (result.quotesFound) {
      row.recordedLabelled++;
      if (!result.passed) row.recordedWrong++;
    }
    const now = rescoreResult(best.report, result, suites);
    if (now === undefined) continue;
    if (now === "cut") {
      row.cut++;
      continue;
    }
    row.rescored++;
    if (result.status === "verified" && now.status !== "verified") row.stale++;
    if (now.passed) row.right++;
    if (now.labelled) {
      row.labelled++;
      if (!now.passed) row.wrong++;
    }
  }
  return row;
}

const rate = (wrong: number, labelled: number) => (labelled ? `${wrong} of ${labelled} (${((100 * wrong) / labelled).toFixed(1)}%)` : "none labelled");
function total(model: string, pick: (r: Row) => boolean) {
  const group = rows.filter((r) => r.model === model && pick(r));
  const sum = (key: "rescored" | "right" | "labelled" | "wrong" | "cut") => group.reduce((n, r) => n + r[key], 0);
  return { suites: group.length, rescored: sum("rescored"), cut: sum("cut"), right: sum("right"), labelled: sum("labelled"), wrong: sum("wrong") };
}

if (values.json) {
  const totals = Object.fromEntries(Object.values(MODELS).map((m) => [m, { all: total(m, () => true), open: total(m, (r) => !r.heldOut), heldOut: total(m, (r) => r.heldOut) }]));
  console.log(JSON.stringify({ harness: HARNESS_VERSION, rows, totals }, null, 2));
} else {
  console.log(`False reassurance on harness ${HARNESS_VERSION}'s label rules, from each suite's latest recorded run (answers from that run's harness; no model asked again)\n`);
  console.log("| Suite | Model | Answers from | Re-scored | Right | Labelled, wrong (false reassurance) | As recorded |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    const cut = (r.cut ? ` (+${r.cut} cut off)` : "") + (r.stale ? `, ${r.stale} with quotes no longer found` : "");
    console.log(`| ${r.suite} | ${r.model} | ${r.harness}, \`${r.file}\` | ${r.rescored} of ${r.tasks}${cut} | ${r.right} | ${rate(r.wrong, r.labelled)} | ${rate(r.recordedWrong, r.recordedLabelled)} |`);
  }
  console.log("\n| Model | Suites | Re-scored | Right | False reassurance, all | Open suites | Held-out suites |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const model of Object.values(MODELS)) {
    const [all, open, held] = [total(model, () => true), total(model, (r) => !r.heldOut), total(model, (r) => r.heldOut)];
    console.log(`| ${model} | ${all.suites} | ${all.rescored} | ${all.right} | ${rate(all.wrong, all.labelled)} | ${rate(open.wrong, open.labelled)} | ${rate(held.wrong, held.labelled)} |`);
  }
  const missing = Object.keys(suites).flatMap((suite) => Object.values(MODELS).filter((m) => !rows.some((r) => r.suite === suite && r.model === m)).map((m) => `${suite} (${m})`));
  if (missing.length) console.log(`\nNo recorded run covers: ${missing.join(", ")}.`);
}
