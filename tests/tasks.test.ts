// Validates the evaluation set itself, so a task cannot fail because it is wrong.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { codingTasks } from "../eval/tasks/coding.ts";
import { pdfTasks } from "../eval/tasks/pdf.ts";
import { pdfSources, sourceText } from "../eval/tasks/pdf-sources.ts";
import { renderPdf } from "../eval/tasks/make-pdfs.ts";
import { researchTasks, type ResearchTask } from "../eval/tasks/research.ts";
import { unanswerableTasks } from "../eval/tasks/unanswerable.ts";
import { loadNodePdfLibrary } from "../eval/harness/pdf-node.ts";
import { NodeCodeRunner } from "../eval/harness/sandbox.ts";
import { referenceSolutions } from "./reference-solutions.ts";
import { readFile } from "node:fs/promises";

const runner = new NodeCodeRunner();
const pdfLibrary = await loadNodePdfLibrary();

describe("evaluation set", () => {
  it("has 46 tasks with unique IDs: 22 research, 8 unanswerable, 4 PDF, 12 coding", () => {
    const ids = [...researchTasks, ...unanswerableTasks, ...pdfTasks, ...codingTasks].map((t) => t.id);
    assert.deepEqual([researchTasks.length, unanswerableTasks.length, pdfTasks.length, codingTasks.length], [22, 8, 4, 12]);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("has 11 unanswerable questions in total, enough to measure refusals", () => {
    const all = [...researchTasks, ...unanswerableTasks].filter((t) => !t.answerable);
    assert.equal(all.length, 11);
    assert.ok(all.every((t) => t.facts.length === 0 && t.citations.length === 0));
  });

  for (const source of pdfSources) {
    it(`${source.id}.pdf is up to date with pdf-sources.ts and extracts word for word`, async () => {
      const committed = await readFile(new URL(`../eval/tasks/pdfs/${source.id}.pdf`, import.meta.url));
      assert.ok(committed.equals(renderPdf(source)), "regenerate with: node eval/tasks/make-pdfs.ts");
      const extracted = pdfLibrary.documentFor(source.id)!.text;
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      assert.equal(norm(extracted), norm(`${source.title} ${sourceText(source)}`));
    });
  }

  for (const task of codingTasks) {
    it(`${task.id}: reference solution passes every test`, async () => {
      const solution = referenceSolutions[task.id];
      assert.ok(solution, "missing reference solution");
      const run = await runner.run(solution, [...task.visibleTests, ...task.hiddenTests]);
      assert.equal(run.error, undefined);
      assert.deepEqual(run.outcomes.filter((o) => !o.passed), []);
    });

    if (task.starterCode) {
      it(`${task.id}: starter code fails at least one test`, async () => {
        const run = await runner.run(task.starterCode!, [...task.visibleTests, ...task.hiddenTests]);
        assert.ok(run.outcomes.some((o) => !o.passed));
      });
    }
  }

  for (const task of [...researchTasks, ...unanswerableTasks, ...pdfTasks] as ResearchTask[]) {
    it(`${task.id}: references real documents and supported facts`, () => {
      const docsById = new Map(pdfLibrary.documents.map((doc) => [doc.id, doc]));
      for (const group of task.citations) {
        for (const id of group) assert.ok(docsById.has(id), `unknown document ${id}`);
      }
      if (!task.answerable) {
        assert.deepEqual(task.facts, []);
        return;
      }
      // Every fact must appear in at least one acceptable cited document.
      const citedText = task.citations
        .flat()
        .map((id) => docsById.get(id)!.text.toLowerCase())
        .join("\n");
      for (const group of task.facts) {
        assert.ok(
          group.some((option) => citedText.includes(option.toLowerCase())),
          `no cited document contains any of ${JSON.stringify(group)}`,
        );
      }
    });
  }
});
