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
import { holdoutTasks } from "../eval/field/holdout.ts";
import { multiHoldoutTasks, multiTasks } from "../eval/field/multi.ts";
import { officeDocuments, officeHoldoutTasks, officeTasks } from "../eval/field/office.ts";
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

  it("asks only for facts its cited documents contain, in the held-out suite too", async () => {
    const suite = await loadFieldSuite();
    for (const task of [...fieldTasks, ...holdoutTasks, ...multiTasks, ...multiHoldoutTasks].filter((t) => t.answerable)) {
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

  it("holds out new questions over the same documents, in the field suite's mix", () => {
    const ids = [...fieldTasks, ...holdoutTasks].map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, "held-out IDs differ from the field suite's");
    const questions = new Set(fieldTasks.map((t) => t.question));
    assert.ok(holdoutTasks.every((t) => !questions.has(t.question)), "no field question is held out again");
    const cited = new Set(holdoutTasks.flatMap((t) => t.citations.flat()));
    assert.deepEqual([...cited].sort(), fieldDocuments.map((d) => d.id).sort(), "every field document is asked about");
    assert.ok(holdoutTasks.some((t) => t.kind === "multi-hop"));
    assert.ok(holdoutTasks.filter((t) => !t.answerable).length >= 2);
  });

  it("asks questions that need more than one passage: no passage holds all their facts", async () => {
    const suite = await loadFieldSuite();
    const passages = (id: string) => (suite.library.index.partsOf(id).length ? suite.library.index.partsOf(id) : [id]);
    for (const task of [...multiTasks, ...multiHoldoutTasks]) {
      assert.ok(task.facts.length >= 2, `${task.id}: one fact needs one passage`);
      const holdsAll = task.citations
        .flat()
        .flatMap(passages)
        .filter((id) => {
          const text = normalize(suite.library.index.get(id)!.text);
          return task.facts.every((group) => group.some((option) => text.includes(normalize(option))));
        });
      assert.deepEqual(holdsAll, [], `${task.id}: one passage holds every fact`);
    }
  });

  it("keeps the multi-passage questions apart from the others, with a held-out part", () => {
    const all = [...fieldTasks, ...holdoutTasks, ...multiTasks, ...multiHoldoutTasks];
    assert.equal(new Set(all.map((t) => t.id)).size, all.length, "task IDs are unique across the suites");
    assert.equal(new Set(all.map((t) => t.question)).size, all.length, "no question is asked twice");
    for (const tasks of [multiTasks, multiHoldoutTasks]) {
      assert.ok(tasks.some((t) => t.citations.length >= 2), "some questions need two documents");
      assert.ok(tasks.some((t) => t.citations.length === 1), "and some need two parts of one");
    }
    assert.ok(multiHoldoutTasks.length >= multiTasks.length / 2, "a third or more is held out");
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
      // Asked to read what it quotes first (read before answering), the model answers again.
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
      /need field/,
    );
  });

});

describe("office suite", () => {
  it("reads its Word, Excel and CSV documents through the app's own readers", async () => {
    const suite = await loadFieldSuite();
    for (const doc of officeDocuments) assert.ok(suite.officeLibrary.documentFor(doc.id)?.text, doc.id);
    for (const doc of fieldDocuments) assert.ok(suite.officeLibrary.documentFor(doc.id), `${doc.id}: the field documents are there too`);
    assert.equal(suite.library.documentFor("orders-2025"), undefined, "the field suite's library is unchanged");
    const card = suite.officeLibrary.documentFor("report-card-2025")!.text;
    assert.match(card, /Perspective: Thinking, Judgment & Expression \| Description: Explains reasoning about shapes, changes and data step by step\. \| Excellent: ◯/);
    const orders = suite.officeLibrary.documentFor("orders-2025")!.text;
    assert.match(orders, /Order: 1047 \| Customer: Ikoma Garden \| Date: 2025\/7\/29 \| Total: ¥88,000 \| Status: Delayed/);
    assert.match(orders, /Sheet: Returns \(hidden\)/);
    const stock = suite.officeLibrary.documentFor("inventory-sjis")!.text;
    assert.match(stock, /品番: B-1042 \| 品名: 平ワッシャー M12 \| 倉庫: 神戸倉庫 \| 在庫数: 1332 \| 単価: ¥1,262/, "Shift_JIS decoded, ¥ restored");
  });

  it("asks only for facts its cited documents contain, with questions and IDs of its own", async () => {
    const suite = await loadFieldSuite();
    const all = [...fieldTasks, ...holdoutTasks, ...multiTasks, ...multiHoldoutTasks, ...officeTasks, ...officeHoldoutTasks];
    assert.equal(new Set(all.map((t) => t.id)).size, all.length, "task IDs are unique across the suites");
    assert.equal(new Set(all.map((t) => t.question)).size, all.length, "no question is asked twice");
    for (const task of [...officeTasks, ...officeHoldoutTasks].filter((t) => t.answerable)) {
      const text = normalize(task.citations.flat().map((id) => suite.officeLibrary.documentFor(id)!.text).join(" "));
      for (const group of task.facts) assert.ok(group.some((option) => text.includes(normalize(option))), `${task.id}: none of ${JSON.stringify(group)} is in its documents`);
    }
    for (const tasks of [officeTasks, officeHoldoutTasks]) {
      const cited = new Set(tasks.flatMap((t) => t.citations.flat()));
      assert.deepEqual([...cited].sort(), officeDocuments.map((d) => d.id).sort(), "every document is asked about");
      assert.ok(tasks.some((t) => !t.answerable) && tasks.some((t) => t.kind === "multi-hop"));
    }
    assert.ok(officeHoldoutTasks.length >= officeTasks.length / 3, "a quarter or more of all is held out");
  });

  it("has report card parts that do not say whose record or which term they are", async () => {
    // What fix B would add (docs/office-formats.md): the questions ask for marks that differ by term.
    const suite = await loadFieldSuite();
    const parts = suite.officeLibrary.index.partsOf("report-card-2025").map((id) => suite.officeLibrary.index.get(id)!.text);
    assert.ok(parts.length >= 5);
    assert.ok(parts.filter((text) => !/Term/.test(text)).length >= 2, "parts without their term");
    assert.ok(parts.every((text) => !/\n\n(Mathematics|Science|Music|Home Economics)$/.test(text)), "headings stay with their tables (#124)");
  });

  it("runs as its own suite, over its own library", async () => {
    const suite = await loadFieldSuite();
    const answer = JSON.stringify({
      tool: "final_answer",
      args: { found: true, answer: "Hayashi Kogyo's phone number is 06-6341-2287.", evidence: [{ docId: "orders-2025", quote: "Customer: Hayashi Kogyo | Contact: Mai Hayashi | Phone: 06-6341-2287" }] },
    });
    const model = new ScriptedModel([
      `{"tool":"search","args":{"query":"Hayashi Kogyo phone"}}`,
      // The library includes Chinese and Japanese documents, so search also translates the terms.
      "林工业 电话",
      "林工業 電話",
      `{"tool":"read","args":{"docId":"orders-2025"}}`,
      answer,
      answer,
    ]);
    const report = await runBenchmark({
      model,
      runner: new NodeCodeRunner(),
      field: suite,
      environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
      config: { suites: ["office"], modes: ["constrained"], taskIds: ["o09-hayashi-phone"] },
    });
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0]!.suite, "office");
    assert.equal(report.results[0]!.passed, true, JSON.stringify(report.results[0]!.checks));
  });
});
