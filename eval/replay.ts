// Which tasks a code change can affect, from a recorded run and no model (harness/replay.ts).
//
//   npm run bench:replay -- --base <git ref> report.json [more.json ...]
//   npm run bench:replay -- --base main --write base-same.json report.json
//   npm run bench:replay -- --merge base-same.json base-rest.json --out base.json
//
// Each task of each report is run twice with its recorded replies: by the code at --base, and by the
// code at --head (the working tree when not given), each version's own runBenchmark. A task in which both
// versions make the same requests of the model, at every step, is "same": on the machine that recorded
// it the model would have answered the same, so the other version's result is the recorded one. A task
// whose requests differ is "differs", from the call named; it has to be run with a model. "Undecidable"
// tasks have to be run too: a report from before harness 0.64.0 has no recorded replies, the suite does
// not exist at one of the versions, or the recording does not replay on the code that made it.
//
// The use, for a change measured by the rule in eval/field/README.md:
// 1. Run the change, which records its replies: bench:endpoint --out change.json.
// 2. bench:replay -- --base <the code before the change> --write base-same.json change.json. It prints
//    the tasks that differ, as --tasks for bench:endpoint, and writes the others' results as the base's.
// 3. Run the base on those tasks only (bench:endpoint at the base, --tasks …, --out base-rest.json), on the
//    same machine, with the same model files and server.
// 4. bench:replay -- --merge base-same.json base-rest.json --out base.json, then
//    bench:compare -- base.json change.json.
//
// The replies replayed are those of the recorded run, so "same" holds for that machine, model file and
// server build: runs repeat there, and do not carry over to others (eval/field/README.md). Scoring and
// labels are not part of the model's input; bench:rescore applies a version's to recorded answers.

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import type { Report, TaskResult } from "./harness/benchmark.ts";
import { firstDifference, ReplayModel, replaysRecording, type Verdict } from "./harness/replay.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));

const { values, positionals } = parseArgs({
  options: {
    base: { type: "string" },
    head: { type: "string" },
    write: { type: "string" },
    merge: { type: "boolean" },
    out: { type: "string" },
  },
  allowPositionals: true,
});

/** Where a report's replayed part came from, so --merge can tell when the parts make a whole. */
interface ReplayNote {
  from: string;
  base: string;
  head: string;
  /** Every task of the replayed report, as "suite/taskId/mode". */
  tasks: string[];
}
type ReplayReport = Report & { replay?: ReplayNote };

const key = (r: Pick<TaskResult, "suite" | "taskId" | "mode">) => `${r.suite}/${r.taskId}/${r.mode}`;

if (values.merge) {
  if (!values.out || positionals.length < 2) {
    console.error("Give the reports to merge and --out, e.g. --merge base-same.json base-rest.json --out base.json");
    process.exit(1);
  }
  const reports = (await Promise.all(positionals.map(async (f) => JSON.parse(await readFile(f, "utf8"))))) as ReplayReport[];
  const results = new Map<string, TaskResult>();
  for (const report of reports) for (const r of report.results) results.set(key(r), r);
  const note = reports.find((r) => r.replay)?.replay;
  const missing = note ? note.tasks.filter((t) => !results.has(t)) : [];
  const merged: ReplayReport = { ...reports[0]!, results: [...results.values()], complete: note ? missing.length === 0 : reports.every((r) => r.complete) };
  delete merged.replay;
  await writeFile(values.out, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`${values.out}: ${results.size} tasks${missing.length ? `; missing ${missing.length}: ${missing.join(", ")}` : ", every task of the replayed report"}.`);
  process.exit(0);
}

if (!values.base || !positionals.length) {
  console.error("Give --base <git ref> and one or more reports, e.g. npm run bench:replay -- --base main eval/results/change.json");
  process.exit(1);
}

/** A version of the code: the working tree, or a git ref checked out in a temporary worktree. */
interface Version {
  name: string;
  root: string;
  cleanup: () => Promise<void>;
  // The modules are that version's own; their types are this version's, and assumed compatible.
  runBenchmark: typeof import("./harness/benchmark.ts").runBenchmark;
  loadFieldSuite: typeof import("./harness/field.ts").loadFieldSuite;
  loadNodePdfLibrary: typeof import("./harness/pdf-node.ts").loadNodePdfLibrary;
  NodeCodeRunner: typeof import("./harness/sandbox.ts").NodeCodeRunner;
  field?: Awaited<ReturnType<typeof import("./harness/field.ts").loadFieldSuite>>;
  pdf?: Awaited<ReturnType<typeof import("./harness/pdf-node.ts").loadNodePdfLibrary>>;
}

async function version(ref: string | undefined): Promise<Version> {
  let root = REPO;
  let cleanup = async () => {};
  if (ref !== undefined) {
    const commit = execFileSync("git", ["-C", REPO, "rev-parse", "--verify", `${ref}^{commit}`], { encoding: "utf8" }).trim();
    const dir = await mkdtemp(join(tmpdir(), "kovrune-replay-"));
    execFileSync("git", ["-C", REPO, "worktree", "add", "--detach", "--quiet", dir, commit]);
    await symlink(join(REPO, "node_modules"), join(dir, "node_modules"));
    root = dir;
    cleanup = async () => {
      execFileSync("git", ["-C", REPO, "worktree", "remove", "--force", dir]);
      await rm(dir, { recursive: true, force: true });
    };
  }
  const load = (path: string) => import(resolve(root, path));
  return {
    name: ref ?? "the working tree",
    root,
    cleanup,
    runBenchmark: (await load("eval/harness/benchmark.ts")).runBenchmark,
    loadFieldSuite: (await load("eval/harness/field.ts")).loadFieldSuite,
    loadNodePdfLibrary: (await load("eval/harness/pdf-node.ts")).loadNodePdfLibrary,
    NodeCodeRunner: (await load("eval/harness/sandbox.ts")).NodeCodeRunner,
  };
}

const FIELD = new Set(["field", "holdout", "multi", "multiholdout", "office", "officeholdout", "clinical", "clinicalholdout", "engineering", "engineeringholdout"]);

/** The requests a version makes when a task is replayed, or why it could not be. */
async function replay(v: Version, report: Report, result: TaskResult): Promise<{ requests: ReplayModel["requests"]; overran: boolean } | { error: string }> {
  const model = new ReplayModel(
    { id: report.environment.modelId, runtime: report.environment.runtime, contextLength: report.environment.contextLength },
    result.replies ?? [],
    result.mode === "constrained",
  );
  try {
    if (FIELD.has(result.suite)) v.field ??= await v.loadFieldSuite();
    if (result.suite === "pdf") v.pdf ??= await v.loadNodePdfLibrary();
    const run = await v.runBenchmark({
      model,
      runner: new v.NodeCodeRunner(),
      field: v.field,
      pdfLibrary: v.pdf,
      environment: report.environment,
      config: { ...report.config, suites: [result.suite], modes: [result.mode], taskIds: [result.taskId] },
    });
    if (!run.results.length) return { error: `${v.name} has no task ${result.taskId} in ${result.suite}` };
  } catch (error) {
    return { error: `${v.name}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}` };
  }
  return { requests: model.requests, overran: model.overran };
}

async function verdict(base: Version, head: Version, report: Report, result: TaskResult): Promise<Verdict> {
  if (!result.replies) return { kind: "undecidable", why: "no recorded replies (a report from before harness 0.64.0)" };
  if (result.suite === "coding") return { kind: "undecidable", why: "coding tasks are not replayed" };
  const [b, h] = [await replay(base, report, result), await replay(head, report, result)];
  if ("error" in h) return { kind: "undecidable", why: h.error };
  if (h.overran || !replaysRecording(h.requests, result.replies)) {
    return { kind: "undecidable", why: `the recording does not replay on ${head.name}: its requests are not the recorded conversations` };
  }
  if ("error" in b) return { kind: "undecidable", why: b.error };
  const at = firstDifference(b.requests, h.requests);
  return at === undefined ? { kind: "same", requests: h.requests.length } : { kind: "differs", at, requests: [b.requests.length, h.requests.length] };
}

const base = await version(values.base);
const head = await version(values.head);
const same: TaskResult[] = [];
const allTasks: string[] = [];
let written: Report | undefined;
try {
  for (const file of positionals) {
    const report = JSON.parse(await readFile(file, "utf8")) as Report;
    if (!Array.isArray(report.results)) {
      console.log(`${file}: not a benchmark report, skipped.\n`);
      continue;
    }
    written ??= report;
    const bySuite = new Map<string, { same: string[]; differs: string[]; undecidable: string[] }>();
    const reasons = new Map<string, number>();
    for (const result of report.results) {
      allTasks.push(key(result));
      const v = await verdict(base, head, report, result);
      const s = bySuite.get(result.suite) ?? { same: [], differs: [], undecidable: [] };
      bySuite.set(result.suite, s);
      if (v.kind === "same") {
        s.same.push(result.taskId);
        same.push(result);
      } else if (v.kind === "differs") s.differs.push(`${result.taskId} (from request ${v.at + 1})`);
      else {
        s.undecidable.push(result.taskId);
        reasons.set(v.why, (reasons.get(v.why) ?? 0) + 1);
      }
    }
    console.log(`${file.split("/").pop()} (harness ${report.harnessVersion}, ${report.environment.modelId}): ${base.name} against ${head.name}`);
    for (const [suite, s] of bySuite) {
      const total = s.same.length + s.differs.length + s.undecidable.length;
      console.log(`  ${suite}: ${s.same.length} of ${total} same, ${s.differs.length} differ, ${s.undecidable.length} undecidable`);
      if (s.differs.length) console.log(`    differ: ${s.differs.join(", ")}`);
    }
    for (const [why, n] of reasons) console.log(`  undecidable (${n}): ${why}`);
    const run = report.results.filter((r) => !same.includes(r)).map((r) => r.taskId);
    console.log(run.length ? `  To run with a model: --tasks ${[...new Set(run)].join(",")}\n` : "  Nothing to run: every task would repeat.\n");
  }
} finally {
  await base.cleanup();
  await head.cleanup();
}

if (values.write && written) {
  const note: ReplayNote = { from: positionals.join(", "), base: base.name, head: head.name, tasks: allTasks };
  const out: ReplayReport = { ...written, results: same, complete: false, replay: note };
  await writeFile(values.write, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${values.write}: the ${same.length} tasks that would repeat, as results for ${base.name}. Run the others, then --merge.`);
}
