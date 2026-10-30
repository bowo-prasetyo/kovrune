// Runs the cross-check (src/agent/crosscheck.ts) on recorded answers, to judge it without running the
// agent (eval/field/README.md): the model reads the answer in the passages without seeing the answer
// given, and code compares the two. It is asked about the answers the review is asked about, and its
// result is combined with the review's recorded verdict: an answer keeps "Quotes found" only if the
// review said yes and the cross-check agrees.
//
//   npm run bench:crosscheck -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km \
//     --out crosscheck.json eval/results/field-0.38-main-qwen3.5-4b-q4km.json
//
// Use the report's own model, build and server settings. With --short, short answers are checked for
// models whose review is not asked about them; their recorded verdict is then taken from --verdicts, a
// bench:rereview output for the same report. With --recheck, a saved output's extracted answers are
// compared again with the current answersAgree, without asking the model. Held-out answers are counted
// only in totals.

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { answersAgree, crossCheckAnswer, type CrossCheck } from "../src/agent/crosscheck.ts";
import type { ReviewVerdict } from "../src/agent/review.ts";
import { LocalEndpointModel } from "../src/models/local-endpoint.ts";
import type { Report } from "./harness/benchmark.ts";
import { HELD_OUT_SUITES } from "./harness/compare.ts";
import { checkedAnswers, loadSuites } from "./harness/recorded.ts";

const { values, positionals } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://127.0.0.1:8080/v1" },
    model: { type: "string" },
    context: { type: "string", default: "4096" },
    "extra-body": { type: "string", default: '{"chat_template_kwargs":{"enable_thinking":false}}' },
    short: { type: "boolean", default: false },
    verdicts: { type: "string" },
    recheck: { type: "string" },
    out: { type: "string" },
  },
  allowPositionals: true,
});
if (positionals.length !== 1 || !(values.model || values.recheck)) {
  console.error("Give one report, and --model or --recheck.");
  process.exit(1);
}

const model = new LocalEndpointModel({
  baseUrl: values["base-url"],
  model: values.model ?? "",
  contextLength: Number(values.context),
  extraBody: JSON.parse(values["extra-body"]),
});
const report = JSON.parse(await readFile(positionals[0]!, "utf8")) as Report;
const { answers, cutOff } = checkedAnswers(report, await loadSuites(), { short: values.short });
// Review verdicts for answers the report did not ask about (short answers with --short).
const reviewed = new Map<string, ReviewVerdict>();
if (values.verdicts) {
  const file = JSON.parse(await readFile(values.verdicts, "utf8")) as { verdicts: Array<{ suite: string; taskId: string; verdict: ReviewVerdict }> };
  for (const v of file.verdicts) reviewed.set(`${v.suite} ${v.taskId}`, v.verdict);
}

// Extracted answers saved by an earlier run, to compare again without the model.
const saved = new Map<string, string | undefined>();
if (values.recheck) {
  const file = JSON.parse(await readFile(values.recheck, "utf8")) as { checked: Array<{ suite: string; taskId: string; extracted?: string }> };
  for (const c of file.checked) saved.set(`${c.suite} ${c.taskId}`, c.extracted);
}

interface Checked {
  suite: string;
  taskId: string;
  right: boolean;
  short: boolean;
  review?: ReviewVerdict;
  extracted?: string;
  agrees: boolean;
}
const checked: Checked[] = [];
for (const a of answers) {
  const key = `${a.suite} ${a.taskId}`;
  let result: CrossCheck;
  if (values.recheck) {
    if (!saved.has(key)) throw new Error(`${key} is not in ${values.recheck}`);
    const extracted = saved.get(key);
    result = extracted === undefined ? { agrees: false } : { extracted, agrees: answersAgree(extracted, a.answer) };
  } else {
    result = await crossCheckAnswer({ model, question: a.question, answer: a.answer, evidence: a.evidence, titleFor: a.titleFor });
  }
  const review = a.recorded ?? reviewed.get(key);
  checked.push({ suite: a.suite, taskId: a.taskId, right: a.right, short: a.short, ...(review ? { review } : {}), ...(result.extracted !== undefined ? { extracted: result.extracted } : {}), agrees: result.agrees });
  if (!HELD_OUT_SUITES.has(a.suite)) {
    console.log(`${a.suite} ${a.taskId}: ${result.agrees ? "agrees" : "differs"} (${JSON.stringify(result.extracted ?? null)}), review ${review ?? "not asked"}, ${a.right ? "right" : "wrong"}${a.short ? ", short" : ""}`);
  }
}

// Totals: the cross-check against right and wrong answers, and the labels with and without it.
const count = (pick: (c: Checked) => boolean) => checked.filter(pick).length;
console.log(`\n${positionals[0]}, cross-check: ${checked.length} answers checked, ${cutOff} cut off in the report.`);
for (const short of [false, true]) {
  const group = checked.filter((c) => c.short === short);
  if (!group.length) continue;
  const n = (agrees: boolean, right: boolean) => group.filter((c) => c.agrees === agrees && c.right === right).length;
  console.log(`${short ? "Short answers" : "Answers the word checks pass"}: agrees with ${n(true, true)} right and ${n(true, false)} wrong, differs from ${n(false, true)} right and ${n(false, false)} wrong.`);
}
const before = (c: Checked) => c.review === "yes";
const after = (c: Checked) => c.review === "yes" && c.agrees;
console.log(`Labelled Quotes found with the review alone: ${count(before)}, ${count((c) => before(c) && !c.right)} wrong.`);
console.log(`With the review and the cross-check: ${count(after)}, ${count((c) => after(c) && !c.right)} wrong; right answers that lose the label: ${count((c) => before(c) && !after(c) && c.right)}.`);
for (const suite of [...new Set(checked.map((c) => c.suite))]) {
  const group = checked.filter((c) => c.suite === suite);
  const lab = (pick: (c: Checked) => boolean) => `${group.filter(pick).length} labelled, ${group.filter((c) => pick(c) && !c.right).length} wrong`;
  console.log(`  ${suite}: ${lab(before)} → ${lab(after)}`);
}
if (values.out) await writeFile(values.out, `${JSON.stringify({ report: positionals[0], checked }, null, 2)}\n`);
