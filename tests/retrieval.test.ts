import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResearchLibrary } from "../src/agent/research.ts";
import { loadFieldSuite } from "../eval/harness/field.ts";
import { loadNodePdfLibrary } from "../eval/harness/pdf-node.ts";
import { appSearch, measureRetrieval, summarizeRetrieval } from "../eval/harness/retrieval.ts";
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

const FIELD_FLOOR = { documentRecall: 0.944, passageRecall: 0.818, complete: 30 };
