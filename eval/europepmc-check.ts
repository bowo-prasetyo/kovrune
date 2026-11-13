// A check of the Europe PMC source against the clinical suite, live and with no model:
//
//   npm run bench:europepmc            # the clinical suite's questions, and its documents
//
// 1. Reading: each of the suite's ten trial reports, read through the source by its PMID, must give the
//    suite's document (eval/clinical/docs) byte for byte, as tests/europepmc.test.ts checks for one from
//    a saved copy. So the full text the app reads is what the models were measured on.
// 2. Search: each question with a document is searched as typed, the hardest query a model can write
//    (all its words, then any of them), and the rank of its paper among the five results is shown.
//    Held-out questions are counted only in total (eval/clinical/README.md).
//
// It asks Europe PMC about 50 times, one request a second. Results change as Europe PMC's index does.

import { readFile } from "node:fs/promises";
import { clinicalHoldoutTasks, clinicalTasks } from "./clinical/tasks.ts";
import { createEuropePmc, EUROPEPMC_API } from "../src/sources/europepmc.ts";
import type { FetchLike } from "../src/sources/types.ts";

const ROOT = new URL("..", import.meta.url);
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));
const politeFetch: FetchLike = async (url, init) => {
  await pause();
  return fetch(url, init);
};

const script = await readFile(new URL("eval/clinical/source/jats2md.py", ROOT), "utf8");
const articles = [...script.matchAll(/"(PMC\d+)": "([^"]+)"/g)].map(([, pmcid, name]) => ({ pmcid: pmcid!, name: name! }));

// The PMID of each paper, which the source's IDs use.
const pmids = new Map<string, string>();
for (const { pmcid, name } of articles) {
  await pause();
  const response = await fetch(`${EUROPEPMC_API}/search?${new URLSearchParams({ query: `PMCID:${pmcid}`, format: "json", resultType: "lite" })}`);
  const record = ((await response.json()) as { resultList?: { result?: Array<{ pmid?: string }> } }).resultList?.result?.[0];
  if (record?.pmid) pmids.set(name, record.pmid);
}

console.log("Reading each paper through the source:");
let same = 0;
for (const { pmcid, name } of articles) {
  const pmid = pmids.get(name);
  const want = await readFile(new URL(`eval/clinical/docs/${name}.md`, ROOT), "utf8");
  const doc = pmid ? await createEuropePmc(politeFetch).fetch(`europepmc:MED/${pmid}`) : undefined;
  const ok = doc?.text === want;
  if (ok) same++;
  console.log(`  ${ok ? "same" : "DIFFERS"}  ${name} (${pmcid}, MED/${pmid ?? "?"})`);
}
console.log(`  ${same} of ${articles.length} give the suite's document.\n`);

async function rankOf(question: string, doc: string): Promise<number | undefined> {
  const pmid = pmids.get(doc);
  const hits = await createEuropePmc(politeFetch).search(question);
  const at = hits.findIndex((h) => h.id === `europepmc:MED/${pmid}`);
  return at < 0 ? undefined : at + 1;
}

for (const [suite, tasks, shown] of [
  ["clinical", clinicalTasks, true],
  ["clinicalholdout", clinicalHoldoutTasks, false],
] as const) {
  const ranks: Array<number | undefined> = [];
  for (const task of tasks) {
    const doc = task.citations[0]?.[0];
    if (!doc) continue;
    const rank = await rankOf(task.question, doc);
    ranks.push(rank);
    if (shown) console.log(`  ${task.id}: ${rank ? `rank ${rank}` : "not in the top 5"}`);
  }
  const top1 = ranks.filter((r) => r === 1).length;
  const top5 = ranks.filter((r) => r !== undefined).length;
  console.log(`${suite}: the paper first for ${top1} of ${ranks.length} questions, in the top 5 for ${top5}.\n`);
}
