import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runBenchmark } from "../eval/harness/benchmark.ts";
import { FIELD_DIR, loadFieldSuite } from "../eval/harness/field.ts";
import { formatReport } from "../eval/harness/format.ts";
import { NodeCodeRunner } from "../eval/harness/sandbox.ts";
import { fieldDocuments, fieldTasks } from "../eval/field/tasks.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ");

class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 4096 };
  private readonly replies: string[];
  constructor(replies: string[]) {
    this.replies = replies;
  }
  supportsConstrainedDecoding() {
    return true;
  }
  async *generate(_request: GenerationRequest) {
    yield { text: this.replies.shift() ?? "{}", done: false };
    yield { text: "", done: true, usage: { promptTokens: 100, completionTokens: 20 } };
  }
  async dispose() {}
}

describe("field suite", () => {
  it("loads the committed documents and tasks, with the PDF read page by page", async () => {
    const suite = await loadFieldSuite();
    assert.equal(suite.tasks.length, fieldTasks.length);
    assert.deepEqual(suite.local, { tasks: 0, documents: 0 });
    assert.equal(new Set(fieldTasks.map((t) => t.id)).size, fieldTasks.length, "task IDs are unique");
    for (const doc of fieldDocuments) assert.ok(suite.library.documentFor(doc.id)?.text, doc.id);
    const design = suite.library.documentFor("kovrune-design-r3")!;
    assert.equal(design.pageStarts?.length, 18);
    assert.ok(suite.library.index.partsOf("kovrune-design-r3").length > 1, "the report is split into parts");
    // Real documents of four kinds, with questions that cannot be answered among them.
    assert.ok(fieldTasks.filter((t) => !t.answerable).length >= 4);
  });

  it("asks only for facts its cited documents contain", async () => {
    const suite = await loadFieldSuite();
    for (const task of fieldTasks.filter((t) => t.answerable)) {
      const cited = task.citations.flat();
      for (const id of cited) assert.ok(suite.library.documentFor(id), `${task.id}: unknown document ${id}`);
      const text = normalize(cited.map((id) => suite.library.documentFor(id)!.text).join(" "));
      for (const group of task.facts) {
        assert.ok(
          group.some((option) => text.includes(normalize(option))),
          `${task.id}: none of ${JSON.stringify(group)} is in ${cited.join(", ")}`,
        );
      }
    }
  });

  it("adds local documents and tasks, and refuses IDs that are taken", async () => {
    const root = await mkdtemp(join(tmpdir(), "kovrune-field-"));
    try {
      await symlink(join(FIELD_DIR, "docs"), join(root, "docs"));
      await mkdir(join(root, "local"));
      await writeFile(join(root, "local", "notes.md"), "# Lab notes\n\nThe centrifuge runs at 4,000 rpm for ten minutes.");
      const manifest = {
        documents: [{ id: "lab-notes", title: "notes.md", file: "notes.md" }],
        tasks: [
          {
            id: "l01-centrifuge",
            kind: "lookup",
            question: "How fast does the centrifuge run?",
            answerable: true,
            facts: [["4,000 rpm"]],
            citations: [["lab-notes"]],
          },
        ],
      };
      await writeFile(join(root, "local", "tasks.json"), JSON.stringify(manifest));
      const suite = await loadFieldSuite(root);
      assert.deepEqual(suite.local, { tasks: 1, documents: 1 });
      assert.equal(suite.tasks.at(-1)!.id, "l01-centrifuge");
      assert.match(suite.library.documentFor("lab-notes")!.text, /4,000 rpm/);

      await writeFile(join(root, "local", "tasks.json"), JSON.stringify({ ...manifest, tasks: [{ ...manifest.tasks[0], id: "f01-preview-permission" }] }));
      await assert.rejects(loadFieldSuite(root), /"f01-preview-permission" is already used/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs as its own suite and says so in the report", async () => {
    const suite = await loadFieldSuite();
    const model = new ScriptedModel([
      `{"tool":"search","args":{"query":"Ada Lovelace born"}}`,
      // The field documents include Chinese and Japanese, so search also translates the terms.
      "埃达·洛夫莱斯 出生",
      "エイダ・ラブレス 誕生",
      `{"tool":"read","args":{"docId":"ada-lovelace-lead"}}`,
      JSON.stringify({
        tool: "final_answer",
        args: {
          found: true,
          answer: "Ada Lovelace was born on 10 December 1815.",
          evidence: [{ docId: "ada-lovelace-lead", quote: "(née Byron; 10 December 1815 – 27 November 1852)" }],
        },
      }),
    ]);
    const report = await runBenchmark({
      model,
      runner: new NodeCodeRunner(),
      field: suite,
      environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
      config: { suites: ["field"], modes: ["constrained"], taskIds: ["f19-ada-born"] },
    });
    assert.equal(report.results[0]!.suite, "field");
    assert.equal(report.results[0]!.passed, true, JSON.stringify(report.results[0]!.checks));
    assert.deepEqual(report.field, { committedTasks: fieldTasks.length, localTasks: 0, localDocuments: 0 });
    assert.match(formatReport(report), new RegExp(`Field suite: ${fieldTasks.length} committed tasks\\.`));
    // Not part of the gate's full evaluation set.
    assert.equal(report.gate.criteria[0]!.passed, false);
    await assert.rejects(
      runBenchmark({
        model,
        runner: new NodeCodeRunner(),
        environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
        config: { suites: ["field"], modes: ["constrained"] },
      }),
      /needs field/,
    );
  });
});
