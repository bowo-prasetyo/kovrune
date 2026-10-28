// Measures the app's search on its own, with no model (eval/harness/retrieval.ts):
//
//   npm run bench:retrieval                # the search as the app runs it
//   npm run bench:retrieval -- --limit 5   # with more results, to compare
//   npm run bench:retrieval -- --distractors 300   # the field library with 300 generated documents added
//
// It takes a few seconds, so run it before a benchmark run for any change to search or chunking.

import { parseArgs } from "node:util";
import { loadFieldSuite } from "./harness/field.ts";
import { loadNodePdfLibrary } from "./harness/pdf-node.ts";
import { distractorDocuments } from "./harness/distractors.ts";
import { appSearch, measureRetrieval, summarizeRetrieval } from "./harness/retrieval.ts";
import { ResearchLibrary } from "../src/agent/research.ts";
import { baseLibrary } from "./harness/suites.ts";
import { pdfTasks } from "./tasks/pdf.ts";
import { researchTasks } from "./tasks/research.ts";

const { values } = parseArgs({ options: { limit: { type: "string" }, distractors: { type: "string" } } });
const limit = values.limit === undefined ? undefined : Number(values.limit);
if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
  console.error(`--limit must be a whole number above 0, not "${values.limit}".`);
  process.exit(1);
}
const distractors = values.distractors === undefined ? 0 : Number(values.distractors);
if (!(Number.isInteger(distractors) && distractors >= 0)) {
  console.error(`--distractors must be a whole number, not "${values.distractors}".`);
  process.exit(1);
}

const field = await loadFieldSuite();
if (field.local.tasks) console.log(`The field suite includes ${field.local.tasks} local tasks (eval/field/local/).\n`);
const suites = [
  { name: "research", library: baseLibrary, tasks: researchTasks },
  { name: "pdf", library: await loadNodePdfLibrary(), tasks: pdfTasks },
  { name: "field", library: field.library, tasks: field.tasks },
  ...(distractors
    ? [
        {
          name: `field with ${distractors} generated documents`,
          library: new ResearchLibrary([...field.library.documents, ...distractorDocuments(distractors)]),
          tasks: field.tasks,
        },
      ]
    : []),
];
const percent = (n: number) => `${Math.round(n * 1000) / 10}%`;

console.log(`Search with ${limit ?? "the app's"} results, the question as the query. Unanswerable tasks have nothing to find.\n`);
for (const { name, library, tasks } of suites) {
  const results = measureRetrieval(library, tasks, appSearch(limit));
  const s = summarizeRetrieval(results);
  console.log(
    `${name}: ${s.tasks} tasks. Cited documents found: ${percent(s.documentRecall)}. Answer passages found: ${percent(s.passageRecall)}. ` +
      `Everything found: ${s.complete} of ${s.tasks}.` +
      (s.acrossScripts ? ` Not counted: ${s.acrossScripts} asked in another writing system, which search translates with the model.` : ""),
  );
  for (const r of results.filter((r) => !r.acrossScripts && (r.documents.found < r.documents.wanted || r.passages.found < r.passages.wanted))) {
    console.log(`  ${r.taskId}: documents ${r.documents.found} of ${r.documents.wanted}, answer passages ${r.passages.found} of ${r.passages.wanted}`);
  }
}
