// Asks the model's check (src/agent/review.ts) again about recorded answers, with a chosen prompt, to
// judge a change to the check without running the agent (eval/field/README.md). The check runs after
// the agent loop, so the agent's answers stay as recorded and only the verdict can change:
//
//   npm run bench:rereview -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km \
//     --prompt itemized --out verdicts.json eval/results/field-0.38-main-qwen3.5-4b-q4km.json
//
// The answers asked about are those the app would ask about: every quote found, and the word checks
// passing, or, for models whose check is asked about short answers (review.ts reviewsShortAnswers)
// or with --short, an answer too short for them. The report's own model, build and server settings
// should be used, so that "--prompt current" gives back the recorded verdicts. Answers cut off in the
// report (it keeps 600 characters of each final answer) are skipped. Held-out answers are counted
// only in totals (eval/field/holdout.ts).

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { answerStatus, checkEvidence, type EvidenceItem } from "../src/agent/evidence.ts";
import { withoutPartLabels, type ResearchLibrary } from "../src/agent/research.ts";
import { reviewAnswer, reviewsShortAnswers, type ReviewVerdict } from "../src/agent/review.ts";
import { reviewAsked, sentenceSupport, wordChecksPass } from "../src/agent/support.ts";
import { LocalEndpointModel } from "../src/models/local-endpoint.ts";
import type { Report } from "./harness/benchmark.ts";
import { HELD_OUT_SUITES } from "./harness/compare.ts";
import { loadFieldSuite } from "./harness/field.ts";
import { REVIEW_PROMPTS } from "./harness/review-prompts.ts";
import { loadNodePdfLibrary } from "./harness/pdf-node.ts";
import { baseLibrary } from "./harness/suites.ts";
import { holdoutTasks } from "./field/holdout.ts";
import { pdfTasks } from "./tasks/pdf.ts";
import { researchTasks, type ResearchTask } from "./tasks/research.ts";
import { unanswerableTasks } from "./tasks/unanswerable.ts";

const { values, positionals } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://127.0.0.1:8080/v1" },
    model: { type: "string" },
    context: { type: "string", default: "4096" },
    "extra-body": { type: "string", default: '{"chat_template_kwargs":{"enable_thinking":false}}' },
    prompt: { type: "string", default: "itemized" },
    short: { type: "boolean", default: false },
    out: { type: "string" },
  },
  allowPositionals: true,
});
const prompt = REVIEW_PROMPTS[values.prompt!];
if (positionals.length !== 1 || !values.model || !prompt) {
  console.error(`Give one report, --model and --prompt (${Object.keys(REVIEW_PROMPTS).join(" or ")}).`);
  process.exit(1);
}

const field = await loadFieldSuite();
const suites: Record<string, { library: ResearchLibrary; tasks: ResearchTask[] }> = {
  research: { library: baseLibrary, tasks: researchTasks },
  unanswerable: { library: baseLibrary, tasks: unanswerableTasks },
  pdf: { library: await loadNodePdfLibrary(), tasks: pdfTasks },
  field: { library: field.library, tasks: field.tasks },
  holdout: { library: field.library, tasks: holdoutTasks },
};
const model = new LocalEndpointModel({
  baseUrl: values["base-url"],
  model: values.model,
  contextLength: Number(values.context),
  extraBody: JSON.parse(values["extra-body"]),
});

interface Verdict {
  suite: string;
  taskId: string;
  right: boolean;
  /** No sentence long enough for the word checks: asked as a short answer. */
  short: boolean;
  recorded?: ReviewVerdict;
  verdict: ReviewVerdict;
}

const report = JSON.parse(await readFile(positionals[0]!, "utf8")) as Report;
const asksShort = values.short || reviewsShortAnswers(report.environment.modelId);
const verdicts: Verdict[] = [];
let skipped = 0;
for (const result of report.results) {
  const suite = suites[result.suite];
  const task = suite?.tasks.find((t) => t.id === result.taskId);
  if (!suite || !task || !result.final) continue;
  let final: { found: boolean; answer: string; evidence: EvidenceItem[] };
  try {
    final = JSON.parse(result.final);
  } catch {
    skipped++;
    continue;
  }
  const { library } = suite;
  const titleFor = (id: string) => library.documentFor(id)?.title;
  const answer = withoutPartLabels(final.answer);
  const evidence = checkEvidence(final.evidence, (id) => library.textFor(id), (id) => library.pageStartsFor(id));
  const status = answerStatus(final.found, evidence);
  const support = sentenceSupport(answer, evidence, titleFor, task.question);
  if (!(wordChecksPass(status, evidence, support) || (asksShort && reviewAsked(status, evidence, support)))) continue;
  const verdict = await reviewAnswer({ model, question: task.question, answer, evidence, titleFor, prompt });
  const recorded = result.support?.review as ReviewVerdict | undefined;
  verdicts.push({ suite: result.suite, taskId: result.taskId, right: result.passed, short: support.judged === 0, ...(recorded ? { recorded } : {}), verdict });
  if (!HELD_OUT_SUITES.has(result.suite)) {
    console.log(`${result.suite} ${result.taskId}: ${verdict}${recorded && recorded !== verdict ? ` (recorded ${recorded})` : ""}, ${result.passed ? "right" : "wrong"}${support.judged === 0 ? ", short" : ""}`);
  }
}

// Totals: what each verdict was given to, and the labels "yes" gives.
const count = (pick: (v: Verdict) => boolean) => verdicts.filter(pick).length;
console.log(`\n${positionals[0]} with the ${values.prompt} prompt: ${verdicts.length} answers asked about, ${skipped} cut off in the report.`);
for (const short of [false, true]) {
  const group = verdicts.filter((v) => v.short === short);
  if (!group.length) continue;
  console.log(`${short ? "Short answers" : "Answers the word checks pass"}:`);
  for (const verdict of ["yes", "partly", "no", "unclear"] as const) {
    const n = (right: boolean) => group.filter((v) => v.verdict === verdict && v.right === right).length;
    if (n(true) + n(false)) console.log(`  ${verdict}: ${n(true)} right, ${n(false)} wrong`);
  }
}
const labelled = count((v) => v.verdict === "yes");
console.log(`Labelled Quotes found: ${labelled}, ${count((v) => v.verdict === "yes" && !v.right)} of them wrong; right answers not confirmed: ${count((v) => v.verdict !== "yes" && v.right)}.`);
for (const suite of Object.keys(suites)) {
  const group = verdicts.filter((v) => v.suite === suite);
  if (group.length) console.log(`  ${suite}: ${group.filter((v) => v.verdict === "yes").length} labelled, ${group.filter((v) => v.verdict === "yes" && !v.right).length} wrong`);
}
const compared = verdicts.filter((v) => v.recorded);
if (compared.length) console.log(`Same verdict as recorded: ${compared.filter((v) => v.recorded === v.verdict).length} of ${compared.length}.`);
if (values.out) await writeFile(values.out, `${JSON.stringify({ report: positionals[0], prompt: values.prompt, verdicts }, null, 2)}\n`);
