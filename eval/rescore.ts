// Re-scores recorded reports with the current quote check, sentence support and label rule, without
// a model (eval/field/README.md). A change to those runs after the agent loop and cannot change what
// the model did, only how its final answer is checked and labelled, so this gives its exact effect:
//
//   npm run bench:rescore -- eval/results/a.json [b.json ...]           # totals, and each change
//   npm run bench:rescore -- --labels eval/results/a.json > labels.txt  # one line per answer, to diff
//
// Only answers whose final answer was recorded whole can be re-scored; reports keep the first 600
// characters. The model's own check (review.ts) is not asked again: its recorded verdict is used.
// Whether an answer passes its task is scored again too, since it requires a verified quote.

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { checkEvidence, answerStatus, type EvidenceItem } from "../src/agent/evidence.ts";
import { withoutPartLabels, type ResearchLibrary } from "../src/agent/research.ts";
import type { ReviewVerdict } from "../src/agent/review.ts";
import { labelledQuotesFound, sentenceSupport } from "../src/agent/support.ts";
import type { Report } from "./harness/benchmark.ts";
import { scoreResearch } from "./harness/scoring.ts";
import { loadFieldSuite } from "./harness/field.ts";
import { loadNodePdfLibrary } from "./harness/pdf-node.ts";
import { baseLibrary } from "./harness/suites.ts";
import { holdoutTasks } from "./field/holdout.ts";
import { pdfTasks } from "./tasks/pdf.ts";
import { researchTasks, type ResearchTask } from "./tasks/research.ts";
import { unanswerableTasks } from "./tasks/unanswerable.ts";

const { values, positionals } = parseArgs({ options: { labels: { type: "boolean" } }, allowPositionals: true });
if (!positionals.length) {
  console.error("Give one or more report files, e.g. npm run bench:rescore -- eval/results/field-0.32-baseline-qwen3.5-4b-q4km.json");
  process.exit(1);
}

const field = await loadFieldSuite();
const pdfLibrary = await loadNodePdfLibrary();
const suites: Record<string, { library: ResearchLibrary; tasks: ResearchTask[] }> = {
  research: { library: baseLibrary, tasks: researchTasks },
  unanswerable: { library: baseLibrary, tasks: unanswerableTasks },
  pdf: { library: pdfLibrary, tasks: pdfTasks },
  field: { library: field.library, tasks: field.tasks },
  holdout: { library: field.library, tasks: holdoutTasks },
};

for (const file of positionals) {
  const report = JSON.parse(await readFile(file, "utf8")) as Report;
  // eval/results also holds the outputs of bench:rereview and bench:crosscheck, which are not reports.
  if (!Array.isArray(report.results)) {
    console.error(`${file.split("/").pop()}: not a benchmark report, skipped.`);
    continue;
  }
  let rescored = 0;
  let skipped = 0;
  const totals = { recorded: { labelled: 0, wrong: 0 }, now: { labelled: 0, wrong: 0 } };
  const changes: string[] = [];
  for (const result of report.results) {
    const suite = suites[result.suite];
    const task = suite?.tasks.find((t) => t.id === result.taskId);
    if (!suite || !task || !result.final) continue;
    let final: { found: boolean; answer: string; evidence: EvidenceItem[] };
    try {
      final = JSON.parse(result.final);
    } catch {
      skipped++; // cut at 600 characters
      continue;
    }
    rescored++;
    const { library } = suite;
    const answer = withoutPartLabels(final.answer);
    const evidence = checkEvidence(final.evidence, (id) => library.textFor(id), (id) => library.pageStartsFor(id));
    const status = answerStatus(final.found, evidence);
    const support = sentenceSupport(answer, evidence, (id) => library.documentFor(id)?.title, task.question);
    const review = result.support?.review as ReviewVerdict | undefined;
    const labelled = labelledQuotesFound(status, evidence, review ? { ...support, review } : support);
    const passed = scoreResearch(task, { status, final: { ...final, answer }, evidence, citations: {}, sourceErrors: [], agent: undefined! }, library).passed;
    for (const [key, value, right] of [["recorded", result.quotesFound ?? false, result.passed], ["now", labelled, passed]] as const) {
      if (value) {
        totals[key].labelled++;
        if (!right) totals[key].wrong++;
      }
    }
    if (passed !== result.passed) changes.push(`  now ${passed ? "passes" : "fails"}: ${result.suite} ${result.taskId}`);
    const line = `${result.suite} ${result.taskId} ${passed ? "right" : "wrong"} ${labelled ? "labelled" : "-"} ${support.backed}/${support.judged}`;
    if (values.labels) console.log(`${file.split("/").pop()} ${line}`);
    if (labelled !== (result.quotesFound ?? false)) {
      const marks = support.sentences.filter((s) => s.backed === false).map((s) => `⚠ ${s.text.trim()}`);
      changes.push(`  ${labelled ? "gains" : "loses"} the label: ${result.suite} ${result.taskId} (${passed ? "right" : "wrong"}) ${marks.join(" ")}`.slice(0, 300));
    }
  }
  if (values.labels) continue;
  const rate = ({ labelled, wrong }: { labelled: number; wrong: number }) => `${wrong} of ${labelled} wrong`;
  console.log(
    `${file.split("/").pop()} (harness ${report.harnessVersion}): ${rescored} answers re-scored, ${skipped} cut off in the report. ` +
      `Labelled "Quotes found": recorded ${rate(totals.recorded)}, now ${rate(totals.now)}.`,
  );
  for (const change of changes) console.log(change);
}
