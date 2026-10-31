// Runs the completeness check (src/agent/completeness.ts) on recorded answers, to judge it without
// running the agent (eval/field/README.md): the model lists the parts the question asks for, with the
// words of the answer that give each, and code checks that every part is there. It is asked about the
// answers a report labels Quotes found (the review said yes, and the cross-check agreed where it ran),
// where the app would ask it, and an answer keeps the label only if it covers every part.
//
//   npm run bench:completeness -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km \
//     --out completeness.json eval/results/field-0.42-main-qwen3.5-4b-q4km.json
//
// Use the report's own model, build and server settings. With --recheck, a saved output's parts are
// compared again with the current coversEveryPart, without asking the model. Held-out answers are
// counted only in totals.

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { checkCompleteness, coversEveryPart, type AnswerPart, type Completeness } from "../src/agent/completeness.ts";
import type { ReviewVerdict } from "../src/agent/review.ts";
import { LocalEndpointModel } from "../src/models/local-endpoint.ts";
import type { Report } from "./harness/benchmark.ts";
import { HELD_OUT_SUITES } from "./harness/compare.ts";
import { checkedAnswers, loadSuites } from "./harness/recorded.ts";
import { answerStatus } from "../src/agent/evidence.ts";
import { labelledQuotesFound, sentenceSupport } from "../src/agent/support.ts";

const { values, positionals } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://127.0.0.1:8080/v1" },
    model: { type: "string" },
    context: { type: "string", default: "4096" },
    "extra-body": { type: "string", default: '{"chat_template_kwargs":{"enable_thinking":false}}' },
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
const suites = await loadSuites();
const { answers, cutOff } = checkedAnswers(report, suites);
const recordedSupport = new Map(report.results.map((r) => [`${r.suite} ${r.taskId}`, r.support]));

// Parts saved by an earlier run, to compare again without the model.
const saved = new Map<string, AnswerPart[] | undefined>();
if (values.recheck) {
  const file = JSON.parse(await readFile(values.recheck, "utf8")) as { checked: Array<{ suite: string; taskId: string; parts?: AnswerPart[] }> };
  for (const c of file.checked) saved.set(`${c.suite} ${c.taskId}`, c.parts);
}

interface Checked {
  suite: string;
  taskId: string;
  right: boolean;
  parts?: AnswerPart[];
  complete: boolean;
}
const checked: Checked[] = [];
for (const a of answers) {
  const key = `${a.suite} ${a.taskId}`;
  const support = recordedSupport.get(key);
  // Only the answers the report labels Quotes found, where the app would ask: checkedAnswers keeps only
  // answers that say they found one, with every quote in its source.
  const { evidence } = a;
  const labelled =
    support?.review !== undefined &&
    labelledQuotesFound(answerStatus(true, evidence), evidence, { ...sentenceSupport(a.answer, evidence, a.titleFor, a.question), ...support, review: support.review as ReviewVerdict });
  if (!labelled) continue;
  let result: Completeness;
  if (values.recheck) {
    if (!saved.has(key)) throw new Error(`${key} is not in ${values.recheck}`);
    const parts = saved.get(key);
    result = parts ? { parts, complete: coversEveryPart(parts, a.answer) } : { complete: false };
  } else {
    result = await checkCompleteness({ model, question: a.question, answer: a.answer });
  }
  checked.push({ suite: a.suite, taskId: a.taskId, right: a.right, ...(result.parts ? { parts: result.parts } : {}), complete: result.complete });
  if (!HELD_OUT_SUITES.has(a.suite)) {
    const parts = result.parts ? result.parts.map((p) => `${p.asks} = ${JSON.stringify(p.answer)}`).join("; ") : "unreadable";
    console.log(`${a.suite} ${a.taskId}: ${result.complete ? "complete" : "INCOMPLETE"}, ${a.right ? "right" : "wrong"} (${parts})`);
  }
}

// Totals: labels with and without the check, per suite and in all.
const tally = (group: Checked[]) => {
  const n = (pick: (c: Checked) => boolean) => group.filter(pick).length;
  return `${group.length} labelled, ${n((c) => !c.right)} wrong → ${n((c) => c.complete)} labelled, ${n((c) => c.complete && !c.right)} wrong; right answers that lose the label: ${n((c) => c.right && !c.complete)}`;
};
console.log(`\n${positionals[0]}, completeness: ${checked.length} labelled answers checked, ${cutOff} cut off in the report.`);
console.log(`All: ${tally(checked)}`);
for (const suite of [...new Set(checked.map((c) => c.suite))]) console.log(`  ${suite}: ${tally(checked.filter((c) => c.suite === suite))}`);
if (values.out) await writeFile(values.out, `${JSON.stringify({ report: positionals[0], checked }, null, 2)}\n`);
