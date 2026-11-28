// Search in a larger library, with no model: one table comparing each suite's library on its own with
// the same library inside a bigger one (docs/p0-research-quality.md, item 4).
//
//   npm run bench:retrieval:scale                  # Markdown, for a reader or the CI job summary
//   npm run bench:retrieval:scale -- --limit 5     # with more search results, to compare
//
// Two kinds of extra documents:
// - **Every suite's real documents.** Each real-document suite (field, office, clinical, engineering,
//   physics, math, cs, lab, chem, socsci, materials) is searched in one library holding all their
//   documents (87 distinct ones), as a researcher's mixed library would. Neighbouring fields (chemistry, materials,
//   laboratory and clinical papers) share vocabulary, so these are realistic competitors. The other
//   suites' documents are renamed with the distractor prefix, so they never count as a cited document
//   or as an answer passage; a document a suite already holds is not added twice.
// - **Generated documents** (harness/distractors.ts), added to the field suite only, for volume. They
//   barely compete: the field suite loses the same few tasks at 300 as at 1,000 of them.
//
// The figures describe search alone. They are diagnostics, not gates: the retrieval floors in
// tests/retrieval.test.ts still decide, and a change to the result limit is judged by model runs
// (CONTRIBUTING.md), not by these figures.

import { parseArgs } from "node:util";
import { ResearchLibrary } from "../src/agent/research.ts";
import type { SourceDocument } from "../src/tools/search.ts";
import { loadFieldSuite } from "./harness/field.ts";
import { DISTRACTOR_PREFIX, distractorDocuments } from "./harness/distractors.ts";
import { appSearch, measureRetrieval, summarizeRetrieval, type RetrievalSummary } from "./harness/retrieval.ts";
import type { ResearchTask } from "./tasks/research.ts";
import { clinicalHoldoutTasks, clinicalTasks } from "./clinical/tasks.ts";
import { engineeringHoldoutTasks, engineeringTasks } from "./engineering/tasks.ts";
import { physicsHoldoutTasks, physicsTasks } from "./physics/tasks.ts";
import { mathHoldoutTasks, mathTasks } from "./math/tasks.ts";
import { chemHoldoutTasks, chemTasks } from "./chem/tasks.ts";
import { socsciHoldoutTasks, socsciTasks } from "./socsci/tasks.ts";
import { materialsHoldoutTasks, materialsTasks } from "./materials/tasks.ts";
import { csHoldoutTasks, csTasks } from "./cs/tasks.ts";
import { labHoldoutTasks, labTasks } from "./lab/tasks.ts";
import { officeHoldoutTasks, officeTasks } from "./field/office.ts";

const { values } = parseArgs({ options: { limit: { type: "string" } } });
const limit = values.limit === undefined ? undefined : Number(values.limit);
if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
  console.error(`--limit must be a whole number above 0, not "${values.limit}".`);
  process.exit(1);
}

const field = await loadFieldSuite();
const suites: Array<{ name: string; library: ResearchLibrary; tasks: ResearchTask[] }> = [
  { name: "field", library: field.library, tasks: field.tasks },
  { name: "office", library: field.officeLibrary, tasks: [...officeTasks, ...officeHoldoutTasks] },
  { name: "clinical", library: field.clinicalLibrary, tasks: [...clinicalTasks, ...clinicalHoldoutTasks] },
  { name: "engineering", library: field.engineeringLibrary, tasks: [...engineeringTasks, ...engineeringHoldoutTasks] },
  { name: "physics", library: field.physicsLibrary, tasks: [...physicsTasks, ...physicsHoldoutTasks] },
  { name: "math", library: field.mathLibrary, tasks: [...mathTasks, ...mathHoldoutTasks] },
  { name: "cs", library: field.csLibrary, tasks: [...csTasks, ...csHoldoutTasks] },
  { name: "lab", library: field.labLibrary, tasks: [...labTasks, ...labHoldoutTasks] },
  { name: "chem", library: field.chemLibrary, tasks: [...chemTasks, ...chemHoldoutTasks] },
  { name: "socsci", library: field.socsciLibrary, tasks: [...socsciTasks, ...socsciHoldoutTasks] },
  { name: "materials", library: field.materialsLibrary, tasks: [...materialsTasks, ...materialsHoldoutTasks] },
];

/** Every other suite's documents, renamed so they never count as cited or as holding an answer. */
function otherSuitesDocuments(own: ResearchLibrary): SourceDocument[] {
  const owned = new Set(own.documents.map((doc) => doc.id));
  const ownedText = new Set(own.documents.map((doc) => doc.text));
  const added = new Set<string>();
  const extra: SourceDocument[] = [];
  for (const { name, library } of suites) {
    if (library === own) continue;
    for (const doc of library.documents) {
      if (owned.has(doc.id) || ownedText.has(doc.text) || added.has(doc.text)) continue;
      added.add(doc.text);
      extra.push({ ...doc, id: `${DISTRACTOR_PREFIX}${name}-${doc.id}` });
    }
  }
  return extra;
}

const cell = (s: RetrievalSummary) => `${pct(s.documentRecall)} | ${pct(s.passageRecall)} | ${s.complete} of ${s.tasks}`;
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const measure = (library: ResearchLibrary, tasks: ResearchTask[]) => summarizeRetrieval(measureRetrieval(library, tasks, appSearch(limit)));

const rows: string[] = [];
let alone = { lost: 0, tasks: 0 };
let pooledSize = 0;
for (const { name, library, tasks } of suites) {
  const own = measure(library, tasks);
  const extra = otherSuitesDocuments(library);
  pooledSize = Math.max(pooledSize, library.documents.length + extra.length);
  const pooled = measure(new ResearchLibrary([...library.documents, ...extra]), tasks);
  alone = { lost: alone.lost + own.complete - pooled.complete, tasks: alone.tasks + own.tasks };
  rows.push(`| ${name} | ${library.documents.length} | ${cell(own)} | ${library.documents.length + extra.length} | ${cell(pooled)} | ${own.complete - pooled.complete} |`);
  if (name === "field") {
    for (const n of [100, 300, 1000]) {
      const generated = measure(new ResearchLibrary([...library.documents, ...extra, ...distractorDocuments(n)]), tasks);
      rows.push(
        `| field, also ${n} generated | ${library.documents.length} | ${cell(own)} | ${library.documents.length + extra.length + n} | ${cell(generated)} | ${own.complete - generated.complete} |`,
      );
    }
  }
}

console.log(`### Search in a larger library (${limit ?? "the app's 3"} results)\n`);
console.log("Documents: share of cited documents among the results. Passages: share of answer facts in a result's text. Complete: tasks with both.\n");
console.log("| Suite | Own library | Documents | Passages | Complete | Larger library | Documents | Passages | Complete | Tasks lost |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const row of rows) console.log(row);
console.log(
  `\nWith all ${pooledSize} real documents in one library, ${alone.lost} of ${alone.tasks} tasks lose something search found in their own library. ` +
    "Diagnostic only: the retrieval floors decide, and a result-limit change needs model runs (CONTRIBUTING.md).",
);
