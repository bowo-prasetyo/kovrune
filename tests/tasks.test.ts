// Validates the evaluation set itself, so a task cannot fail because it is wrong.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { codingTasks } from "../eval/tasks/coding.ts";
import { corpus } from "../eval/tasks/corpus.ts";
import { researchTasks } from "../eval/tasks/research.ts";
import { NodeCodeRunner } from "../eval/harness/sandbox.ts";
import { referenceSolutions } from "./reference-solutions.ts";

const runner = new NodeCodeRunner();
const docsById = new Map(corpus.map((doc) => [doc.id, doc]));

describe("evaluation set", () => {
  it("has 20-50 tasks with unique IDs", () => {
    const ids = [...researchTasks, ...codingTasks].map((t) => t.id);
    assert.ok(ids.length >= 20 && ids.length <= 50, `${ids.length} tasks`);
    assert.equal(new Set(ids).size, ids.length);
  });

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

  for (const task of researchTasks) {
    it(`${task.id}: references real documents and supported facts`, () => {
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
