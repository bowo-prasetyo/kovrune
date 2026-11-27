// Whether the plan screen's source check predicts how report sections turn out, from recorded report
// runs and no model (harness 0.110.0, eval/harness/report-score.ts predictFromCoverage).
//
//   npm run bench:plancoverage -- eval/results/reports-0.55-qwen3.5-4b-q4km.json [more.json ...]
//
// The check is deterministic, so it is run again on each recorded plan's questions over today's field
// library; a run recorded from 0.110.0 on also keeps the hint the app showed (plan.sectionCoverage), and
// that is used when present. Each written section's recorded answer is scored as bench:report scores it.
// Held-out reports are included only in the totals.

import { readFile } from "node:fs/promises";
import { assessPlanCoverage, type PlanSectionCoverage } from "../src/agent/report.ts";
import { loadFieldSuite } from "./harness/field.ts";
import { describePrediction, emptyPrediction, predictFromCoverage, type WrittenSection } from "./harness/report-score.ts";
import { reportHoldoutTasks, reportTasks } from "./field/reports.ts";

interface RecordedReport {
  suite: "reports" | "reportsholdout";
  taskId: string;
  plan: { sections: string[]; sectionCoverage?: PlanSectionCoverage[] };
  sections: WrittenSection[];
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: npm run bench:plancoverage -- <report run>.json [...]");
  process.exit(1);
}
const field = await loadFieldSuite();
const tasks = new Map([...reportTasks, ...reportHoldoutTasks].map((t) => [t.id, t]));
const total = { reports: emptyPrediction(), reportsholdout: emptyPrediction() };

for (const file of files) {
  const run = JSON.parse(await readFile(file, "utf8")) as { harnessVersion: string; results: RecordedReport[] };
  const own = { reports: emptyPrediction(), reportsholdout: emptyPrediction() };
  let recomputed = 0;
  for (const result of run.results) {
    const task = tasks.get(result.taskId);
    if (!task) continue;
    const hints = result.plan.sectionCoverage ?? (recomputed++, assessPlanCoverage(field.library, result.plan.sections));
    predictFromCoverage(task, hints, result.sections, own[result.suite]);
    predictFromCoverage(task, hints, result.sections, total[result.suite]);
  }
  console.log(`\n${file} (harness ${run.harnessVersion}; hint ${recomputed ? `worked out again for ${recomputed} reports` : "as recorded"})`);
  console.log(indent(describePrediction(own.reports)));
}

console.log("\nTotal, open reports:");
console.log(indent(describePrediction(total.reports)));
console.log("Total, held-out reports:");
console.log(indent(describePrediction(total.reportsholdout)));

function indent(text: string): string {
  return text.replace(/^/gm, "  ");
}

