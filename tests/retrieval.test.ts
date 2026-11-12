import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResearchLibrary } from "../src/agent/research.ts";
import { DocumentIndex, leadWeight } from "../src/tools/search.ts";
import { loadFieldSuite } from "../eval/harness/field.ts";
import { loadNodePdfLibrary } from "../eval/harness/pdf-node.ts";
import { appSearch, measureRetrieval, summarizeRetrieval } from "../eval/harness/retrieval.ts";
import { DISTRACTOR_PREFIX, distractorDocuments } from "../eval/harness/distractors.ts";
import { baseLibrary } from "../eval/harness/suites.ts";
import { pdfTasks } from "../eval/tasks/pdf.ts";
import { researchTasks, type ResearchTask } from "../eval/tasks/research.ts";

const task = (id: string, question: string, citations: string[][], facts: string[][]): ResearchTask => ({
  id,
  kind: "lookup",
  question,
  answerable: true,
  facts,
  citations,
});

describe("retrieval measure", () => {
  const library = new ResearchLibrary([
    { id: "pages", title: "Storage notes", text: "The default page size is 4 KiB." },
    { id: "history", title: "Project history", text: "The project started in 2019 at Harrow Labs." },
    { id: "fuji", title: "富士山", text: "富士山の標高は3776.12 mである。" },
  ]);

  it("counts cited documents among the results, and facts in the results' own text", () => {
    const [found, missed] = measureRetrieval(library, [
      task("t1", "What is the default page size?", [["pages"]], [["4 KiB"]]),
      task("t2", "What is the default page size, and when did the project start?", [["pages"], ["history"]], [["4 KiB"], ["2020"]]),
    ]);
    assert.deepEqual(found!.documents, { found: 1, wanted: 1 });
    assert.deepEqual(found!.passages, { found: 1, wanted: 1 });
    assert.deepEqual(missed!.documents, { found: 2, wanted: 2 });
    assert.deepEqual(missed!.passages, { found: 1, wanted: 2 }, "2020 is in no result");
    assert.deepEqual(summarizeRetrieval([found!, missed!]), { tasks: 2, acrossScripts: 0, documentRecall: 1, passageRecall: 0.667, complete: 1 });
  });

  it("leaves out unanswerable tasks, and counts questions in another writing system apart", () => {
    const results = measureRetrieval(library, [
      { ...task("u1", "Who is the CEO?", [], []), answerable: false },
      task("x1", "How high is Mount Fuji?", [["fuji"]], [["3776.12"]]),
    ]);
    assert.deepEqual(
      results.map((r) => [r.taskId, r.acrossScripts]),
      [["x1", true]],
    );
    assert.equal(summarizeRetrieval(results).acrossScripts, 1);
  });

  it("does not count an answer's spelling in a generated document as its passage", () => {
    const withDistractor = new ResearchLibrary([
      { id: "pages", title: "Storage notes", text: "The default page size is 4 KiB." },
      { id: `${DISTRACTOR_PREFIX}1`, title: "Other notes", text: "The default page size is 8 KiB, and the cache page size is 4 KiB." },
    ]);
    const [result] = measureRetrieval(withDistractor, [task("t4", "What is the cache page size?", [["pages"]], [["8 KiB"]])]);
    assert.deepEqual(result!.passages, { found: 0, wanted: 1 });
  });

  it("measures more results when asked", () => {
    const [few] = measureRetrieval(library, [task("t3", "page size project", [["history"]], [])], appSearch(1));
    const [more] = measureRetrieval(library, [task("t3", "page size project", [["history"]], [])], appSearch(3));
    assert.deepEqual([few!.documents.found, more!.documents.found], [0, 1]);
  });
});

// Floors for the app's search, so a change to search or chunking that finds less shows in the tests.
// Raise them when search improves (npm run bench:retrieval prints the figures).
describe("retrieval on the evaluation set", () => {
  it("finds every cited document and answer passage in the research and pdf suites", async () => {
    for (const [library, tasks] of [
      [baseLibrary, researchTasks],
      [await loadNodePdfLibrary(), pdfTasks],
    ] as const) {
      const summary = summarizeRetrieval(measureRetrieval(library, tasks));
      assert.equal(summary.complete, summary.tasks);
    }
  });

  it("keeps the field suite's retrieval at least where it is", async () => {
    const field = await loadFieldSuite();
    const summary = summarizeRetrieval(measureRetrieval(field.library, field.tasks));
    assert.ok(summary.documentRecall >= FIELD_FLOOR.documentRecall, `cited documents: ${summary.documentRecall}`);
    assert.ok(summary.passageRecall >= FIELD_FLOOR.passageRecall, `answer passages: ${summary.passageRecall}`);
    assert.ok(summary.complete >= FIELD_FLOOR.complete, `complete: ${summary.complete}`);
  });
});

// Since 0.63.0, a document's first parts weigh more among its own parts (search.ts leadWeight), which
// loses one answer passage here (f46: the user guide's paragraph on the permission, read in French) and
// gains the clinical suite's; see eval/clinical/README.md, "A paper's first parts first".
const FIELD_FLOOR = { documentRecall: 0.974, passageRecall: 0.921, complete: 68 };

// A user's library can hold hundreds of documents; the field library has seven. With 300 generated
// documents near its topics added (eval/harness/distractors.ts), search still has to find what it
// finds now. Over seeds 1 to 5 the figures are 90.9–93.5% and 89.9–91%, 67 to 69 tasks, so a change
// that falls below the floors of seed 1 loses ground to a larger library, not to chance in the seed.
describe("retrieval in a library of hundreds of documents", () => {
  it("generates the same documents for the same seed, apart from the real ones", () => {
    const docs = distractorDocuments(300);
    assert.equal(docs.length, 300);
    assert.deepEqual(distractorDocuments(300), docs);
    assert.notDeepEqual(distractorDocuments(300, 2), docs);
    assert.ok(docs.every((d) => d.id.startsWith(DISTRACTOR_PREFIX) && d.text.length > 0));
    assert.ok(docs.filter((d) => d.text.length > 1800).length >= 30, "some are long enough to be split into parts");
  });

  it("keeps the field suite's retrieval with 300 generated documents added", async () => {
    const field = await loadFieldSuite();
    const library = new ResearchLibrary([...field.library.documents, ...distractorDocuments(300)]);
    const summary = summarizeRetrieval(measureRetrieval(library, field.tasks));
    assert.ok(summary.documentRecall >= SCALE_FLOOR.documentRecall, `cited documents: ${summary.documentRecall}`);
    assert.ok(summary.passageRecall >= SCALE_FLOOR.passageRecall, `answer passages: ${summary.passageRecall}`);
    assert.ok(summary.complete >= SCALE_FLOOR.complete, `complete: ${summary.complete}`);
  });
});

// Since 0.57.0, headings kept with what they introduce lose one answer passage here (f46), on every
// size and seed measured; see eval/field/README.md, "Headings kept with what they introduce".
// Since 0.63.0, the lead weight loses the same passage (f46) here; cited documents are unchanged, since
// it orders only a document's own parts.
const SCALE_FLOOR = { documentRecall: 0.935, passageRecall: 0.888, complete: 67 };

describe("a document's first parts first, among its own parts (harness 0.63.0)", () => {
  // A paper in four parts: its abstract gives the result once; its Discussion repeats the query's terms.
  const paper = [
    { id: "trial#1", title: "Malaria trial (part 1 of 4)", text: "Findings: the risk ratio for any malaria infection was 0.45 with monthly dihydroartemisinin-piperaquine." },
    { id: "trial#2", title: "Malaria trial (part 2 of 4)", text: "Methods: women were randomly assigned to co-trimoxazole with or without monthly treatment." },
    { id: "trial#3", title: "Malaria trial (part 3 of 4)", text: "Discussion: monthly dihydroartemisinin-piperaquine malaria malaria pregnant women risk HIV malaria." },
    { id: "trial#4", title: "Malaria trial (part 4 of 4)", text: "Discussion: dihydroartemisinin-piperaquine malaria pregnant women HIV malaria malaria monthly risk." },
  ];
  const other = { id: "other", title: "Another paper", text: "Monthly malaria chemoprevention with dihydroartemisinin-piperaquine in pregnant women: malaria risk." };
  const query = "monthly dihydroartemisinin-piperaquine malaria risk ratio";

  it("weighs a document's first parts more, and a document in one part not at all", () => {
    assert.ok(leadWeight("trial#1") > leadWeight("trial#3") && leadWeight("trial#3") > leadWeight("trial#9") && leadWeight("trial#9") > 1);
    assert.equal(leadWeight("other"), 1);
  });

  it("shows a document's early part in place of a later one it matches nearly as well", () => {
    const shown = new DocumentIndex([...paper, other]).search(query, 2).map((h) => h.docId);
    assert.ok(shown.includes("trial#1"), `the abstract is shown: ${shown.join(", ")}`);
  });

  it("does not let a document's first parts take a slot from another document", () => {
    // By relevance alone: paper A's part 5, then paper B, then A's part 1. The two results are one of
    // A's parts and B: A's part 1 may take its own paper's slot, not B's.
    const filler = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
    const malaria = (n: number) => `${"malaria ".repeat(n)}${filler}`;
    const docs = [
      { id: "a#1", title: "Paper A (part 1 of 5)", text: malaria(3) },
      ...[2, 3, 4].map((n) => ({ id: `a#${n}`, title: `Paper A (part ${n} of 5)`, text: filler })),
      { id: "a#5", title: "Paper A (part 5 of 5)", text: malaria(5) },
      { id: "b", title: "Paper B", text: malaria(4) },
    ];
    const index = new DocumentIndex(docs);
    assert.deepEqual(index.search("malaria", 2).map((h) => h.docId), ["a#1", "b"]);
    assert.deepEqual(index.search("malaria", 3).map((h) => h.docId), ["a#1", "b", "a#5"]);
  });
});

