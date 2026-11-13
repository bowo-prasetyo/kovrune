// The clinical suite's questions, answered by a model with Europe PMC as its only source and no documents,
// live (npm run bench:europepmc checks the source with no model):
//
//   npm run bench:europepmc:model -- --base-url http://127.0.0.1:8080/v1 --model qwen3.5-4b-q4km \
//     --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}' --out eval/results/europepmc-model.json
//
// Each question is scored twice:
// - strictly, as the suite scores it: every fact group in the answer, a verified quote, and a citation of
//   the suite's own paper, named by its Europe PMC ID;
// - by trial: the same, except that a citation of another paper of the same trial counts too. A paper is of
//   the same trial when its text gives the trial registration number the suite's paper gives (ISRCTN, NCT,
//   ACTRN, PACTR). The questions ask about a trial ("the FASSTT trial", "the REVAMP trial"), and the open
//   literature holds several reports of most trials, each with its methods: asked FASSTT's folic acid dose,
//   Qwen3.5-4B answered 400 µg from the trial's 2019 follow-up, which the strict score counts as the wrong
//   paper (eval/clinical/README.md). A trial run before registration (the betamethasone trial, 1969–74)
//   has no number, and only its suite paper counts.
//
// Neither score changes the suite's questions or facts. Held-out questions are counted only in total, as in
// the suite. Europe PMC's index changes, so runs on different days are compared only with care.

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { clinicalDocuments, clinicalHoldoutTasks, clinicalTasks } from "./clinical/tasks.ts";
import { registrations } from "./clinical/trials.ts";
import type { ResearchTask } from "./tasks/research.ts";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { LocalEndpointModel } from "../src/models/local-endpoint.ts";
import { createEuropePmc, EUROPEPMC_API } from "../src/sources/europepmc.ts";

const ROOT = new URL("..", import.meta.url);

const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://127.0.0.1:8080/v1" },
    model: { type: "string" },
    context: { type: "string", default: "4096" },
    "api-key": { type: "string" },
    "extra-body": { type: "string" },
    tasks: { type: "string" },
    out: { type: "string" },
  },
});
if (!values.model) {
  console.error("Missing --model, e.g. --model qwen3.5-4b-q4km");
  process.exit(1);
}

const model = new LocalEndpointModel({
  baseUrl: values["base-url"],
  model: values.model,
  contextLength: Number(values.context),
  apiKey: values["api-key"],
  extraBody: values["extra-body"] ? JSON.parse(values["extra-body"]) : undefined,
});

// Each suite paper's PMID, which the source's IDs use, and the registrations its text gives.
const script = await readFile(new URL("eval/clinical/source/jats2md.py", ROOT), "utf8");
const papers = new Map<string, { pmid: string; registrations: Set<string> }>();
for (const [, pmcid, name] of script.matchAll(/"(PMC\d+)": "([^"]+)"/g)) {
  const response = await fetch(`${EUROPEPMC_API}/search?${new URLSearchParams({ query: `PMCID:${pmcid}`, format: "json", resultType: "lite" })}`);
  const pmid = ((await response.json()) as { resultList?: { result?: Array<{ pmid?: string }> } }).resultList?.result?.[0]?.pmid;
  const doc = clinicalDocuments.find((d) => d.id === name)!;
  if (pmid) papers.set(name!, { pmid, registrations: registrations(await readFile(new URL(`eval/clinical/docs/${doc.file}`, ROOT), "utf8")) });
}

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ");
const only = values.tasks?.split(",");
const reader = createEuropePmc();

interface Outcome {
  suite: string;
  taskId: string;
  strict: boolean;
  byTrial: boolean;
  facts: boolean;
  citedPaper: boolean;
  citedTrial: boolean;
  status: string;
  cited: string[];
  answer?: string;
  actions: string[];
  seconds: number;
}

const outcomes: Outcome[] = [];
for (const [suite, tasks] of [
  ["clinical", clinicalTasks],
  ["clinicalholdout", clinicalHoldoutTasks],
] as Array<[string, ResearchTask[]]>) {
  for (const task of tasks) {
    const paper = papers.get(task.citations[0]?.[0] ?? "");
    if (!paper || !task.answerable || (only && !only.some((id) => task.id.startsWith(id)))) continue;
    const start = Date.now();
    const result = await runResearch({ question: task.question, library: new ResearchLibrary([]), model, sources: [createEuropePmc()], constrained: true });
    const final = result.final;
    const want = `europepmc:MED/${paper.pmid}`;
    const cited = [...new Set((final?.evidence ?? []).map((e) => e.docId.replace(/#\d+$/, "")))];
    let citedTrial = cited.includes(want);
    for (const id of cited) {
      if (citedTrial || !paper.registrations.size || !id.startsWith("europepmc:")) break;
      const text = await reader.fetch(id).then((doc) => doc.text, () => "");
      citedTrial = [...registrations(text)].some((r) => paper.registrations.has(r));
    }
    const facts = !!final && task.facts.every((group) => group.some((option) => norm(final.answer).includes(norm(option))));
    const done = !!final && final.found && facts && result.status === "verified";
    const outcome: Outcome = {
      suite,
      taskId: task.id,
      strict: done && cited.includes(want),
      byTrial: done && citedTrial,
      facts,
      citedPaper: cited.includes(want),
      citedTrial,
      status: result.status,
      cited,
      ...(final ? { answer: final.answer } : {}),
      actions: result.agent.calls.filter((c) => c.valid).map((c) => `${c.tool} ${JSON.stringify(c.args)}`),
      seconds: Math.round((Date.now() - start) / 1000),
    };
    outcomes.push(outcome);
    if (suite === "clinical") console.log(`${task.id}: ${outcome.strict ? "pass" : "fail"} strictly, ${outcome.byTrial ? "pass" : "fail"} by trial (facts ${facts}, cited ${cited.join(", ") || "nothing"}, ${result.status}) ${outcome.seconds} s`);
  }
}

for (const suite of ["clinical", "clinicalholdout"]) {
  const these = outcomes.filter((o) => o.suite === suite);
  if (these.length) console.log(`${suite}: ${these.filter((o) => o.strict).length} of ${these.length} strictly, ${these.filter((o) => o.byTrial).length} by trial.`);
}
if (values.out) {
  await writeFile(values.out, `${JSON.stringify({ model: values.model, date: new Date().toISOString(), outcomes }, null, 2)}\n`);
  console.log(`Report written to ${values.out}`);
}
