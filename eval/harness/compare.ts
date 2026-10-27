// Two runs of the same tasks, before and after a change, compared task by task (audit item 3).
// A change is judged against a baseline run on the same machine (eval/field/README.md), and the
// paired comparison says whether a difference of a few tasks is more than chance.

import type { Report, TaskResult } from "./benchmark.ts";
import { mcnemar } from "./stats.ts";

/** Suites whose tasks are named only as counts, so a change is not tuned on them (eval/field/README.md). */
export const HELD_OUT_SUITES = new Set(["holdout"]);

export interface SuiteComparison {
  suite: string;
  mode: string;
  /** Tasks run in both reports. */
  tasks: number;
  before: number;
  after: number;
  /** Tasks that pass only after the change, and only before it; empty for held-out suites. */
  gained: string[];
  lost: string[];
  gainedCount: number;
  lostCount: number;
  /** Exact McNemar p-value: the chance of a split this uneven if the change did nothing. */
  p: number;
  /** Tasks that took the same actions in both runs. */
  sameActions: number;
}

export interface Comparison {
  suites: SuiteComparison[];
  /** Why the two reports may not be comparable, e.g. another CPU or model. */
  warnings: string[];
}

const key = (r: TaskResult) => `${r.suite}/${r.mode}/${r.taskId}`;

export function compareReports(before: Report, after: Report): Comparison {
  const warnings: string[] = [];
  const [envBefore, envAfter] = [before.environment, after.environment];
  if (envBefore.modelId !== envAfter.modelId) warnings.push(`The models differ: ${envBefore.modelId} and ${envAfter.modelId}.`);
  const [cpuBefore, cpuAfter] = [envBefore.hardware?.cpu, envAfter.hardware?.cpu];
  if (cpuBefore !== cpuAfter) {
    warnings.push(
      `The runs used different CPUs (${cpuBefore ?? "unknown"} and ${cpuAfter ?? "unknown"}): results do not repeat across machines, so the difference may not be the change's.`,
    );
  }
  if (!before.complete || !after.complete) warnings.push("A report is incomplete; only tasks in both are compared.");
  const errors = [before, after].map((r) => r.results.filter((t) => t.error).length);
  if (errors[0] || errors[1]) warnings.push(`Tasks stopped with an error: ${errors[0]} before, ${errors[1]} after. A model server that went away fails tasks in 0 s.`);

  const afterByKey = new Map(after.results.map((r) => [key(r), r]));
  const groups = new Map<string, Array<[TaskResult, TaskResult]>>();
  for (const a of before.results) {
    const b = afterByKey.get(key(a));
    if (!b) continue;
    const group = `${a.suite}/${a.mode}`;
    groups.set(group, [...(groups.get(group) ?? []), [a, b]]);
  }
  const suites = [...groups.values()].map((pairs): SuiteComparison => {
    const [first] = pairs[0]!;
    const held = HELD_OUT_SUITES.has(first.suite);
    const gained = pairs.filter(([a, b]) => !a.passed && b.passed).map(([a]) => a.taskId);
    const lost = pairs.filter(([a, b]) => a.passed && !b.passed).map(([a]) => a.taskId);
    return {
      suite: first.suite,
      mode: first.mode,
      tasks: pairs.length,
      before: pairs.filter(([a]) => a.passed).length,
      after: pairs.filter(([, b]) => b.passed).length,
      gained: held ? [] : gained,
      lost: held ? [] : lost,
      gainedCount: gained.length,
      lostCount: lost.length,
      p: mcnemar(gained.length, lost.length),
      sameActions: pairs.filter(([a, b]) => JSON.stringify(a.actions) === JSON.stringify(b.actions)).length,
    };
  });
  return { suites, warnings };
}

/** A Markdown table of a comparison, with the tasks that changed. */
export function formatComparison(comparison: Comparison): string {
  const p = (x: number) => (x >= 0.995 ? "1" : x < 0.001 ? "< 0.001" : x.toFixed(x < 0.1 ? 3 : 2));
  const lines = [
    ...comparison.warnings.map((w) => `⚠ ${w}`),
    ...(comparison.warnings.length ? [""] : []),
    "| Suite | Mode | Before | After | Gained | Lost | p (McNemar) | Same actions |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...comparison.suites.map(
      (s) =>
        `| ${s.suite} | ${s.mode} | ${s.before}/${s.tasks} | ${s.after}/${s.tasks} | ${s.gainedCount} | ${s.lostCount} | ${p(s.p)} | ${s.sameActions} of ${s.tasks} |`,
    ),
    "",
  ];
  for (const s of comparison.suites) {
    if (HELD_OUT_SUITES.has(s.suite)) continue;
    if (s.gained.length) lines.push(`- ${s.suite} gained: ${s.gained.join(", ")}`);
    if (s.lost.length) lines.push(`- ${s.suite} lost: ${s.lost.join(", ")}`);
  }
  lines.push(
    "",
    "p is the chance of a split at least this uneven between gained and lost tasks if the change did nothing. With a few discordant tasks it cannot be small: 2 gained and 0 lost gives 0.5, and it takes 6 to 0 to go below 0.05.",
  );
  return lines.join("\n");
}
