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
import { clinicalDocuments, clinicalHoldoutTasks, clinicalTasks } from "../eval/clinical/tasks.ts";
import { csDocuments, csHoldoutTasks, csTasks } from "../eval/cs/tasks.ts";
import { labDocuments, labHoldoutTasks, labTasks } from "../eval/lab/tasks.ts";
import { engineeringDocuments, engineeringHoldoutTasks, engineeringTasks } from "../eval/engineering/tasks.ts";
import { physicsDocuments, physicsHoldoutTasks, physicsTasks } from "../eval/physics/tasks.ts";
import { mathDocuments, mathHoldoutTasks, mathTasks } from "../eval/math/tasks.ts";
import { chemDocuments, chemHoldoutTasks, chemTasks, NO_EFFECT as CHEM_NO_EFFECT } from "../eval/chem/tasks.ts";
import { scoreResearch } from "../eval/harness/scoring.ts";
import { ResearchLibrary, type ResearchResult } from "../src/agent/research.ts";
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
        })
        // Since harness 0.70.0 marks a PDF's paragraphs, the design's part 24 holds "Reproducible builds from tagged
        // commits" next to the static hosts: the word, not the commit the user guide says the preview page shows.
        .filter((id) => !(task.id === "m09-preview-hosts" && id === "kovrune-design-r3#24"));
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
    const all = [...fieldTasks, ...holdoutTasks, ...multiTasks, ...multiHoldoutTasks, ...officeTasks, ...officeHoldoutTasks, ...clinicalTasks, ...clinicalHoldoutTasks, ...csTasks, ...csHoldoutTasks, ...labTasks, ...labHoldoutTasks, ...engineeringTasks, ...engineeringHoldoutTasks, ...physicsTasks, ...physicsHoldoutTasks, ...mathTasks, ...mathHoldoutTasks, ...chemTasks, ...chemHoldoutTasks];
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

describe("clinical suite", () => {
  it("reads ten CC BY trial reports as published, in a library of their own", async () => {
    const suite = await loadFieldSuite();
    assert.equal(clinicalDocuments.length, 10);
    for (const doc of clinicalDocuments) {
      const text = suite.clinicalLibrary.documentFor(doc.id)?.text ?? "";
      assert.match(text, /CC BY|Creative Commons Attribution/, `${doc.id}: its licence is in the document`);
      assert.match(doc.title, /PMC\d+\)$/, `${doc.id}: its title names the article`);
      assert.ok(text.length > 30_000, `${doc.id}: the whole article, not its abstract`);
    }
    assert.equal(suite.clinicalLibrary.documents.length, clinicalDocuments.length, "only the trial reports");
    assert.equal(suite.library.documentFor("copcov-hydroxychloroquine"), undefined, "the field suite's library is unchanged");
    // The Lancet's decimals and thousands are kept as printed, which the quote check must handle.
    const typhoid = suite.clinicalLibrary.documentFor("typhoid-vaccine-malawi")!.text;
    assert.match(typhoid, /efficacy of Vi-TT was 78·3% \(95% CI 66·3–86·1\)/);
    assert.match(typhoid, /14 069 were assigned to receive Vi-TT/);
    // Tables are kept as rows, with each value in its own column.
    assert.match(suite.clinicalLibrary.documentFor("iv-iron-pregnancy-malawi")!.text, /\| Age, years \| 22·2 \(6·0\) \| 22·5 \(6·3\) \|/);
    assert.match(suite.clinicalLibrary.documentFor("folic-acid-pregnancy")!.text, /400 µg\/day of FA \(n = 96\) or placebo \(n = 94\)/);
  });

  it("asks only for facts its cited documents contain, about every document, with a third held out", async () => {
    const suite = await loadFieldSuite();
    for (const task of [...clinicalTasks, ...clinicalHoldoutTasks]) {
      if (!task.answerable) {
        assert.deepEqual([task.facts, task.citations], [[], []], task.id);
        continue;
      }
      const text = normalize(task.citations.flat().map((id) => suite.clinicalLibrary.documentFor(id)!.text).join(" "));
      for (const group of task.facts) assert.ok(group.some((option) => text.includes(normalize(option))), `${task.id}: none of ${JSON.stringify(group)} is in its documents`);
    }
    const cited = new Set(clinicalTasks.flatMap((t) => t.citations.flat()));
    assert.deepEqual([...cited].sort(), clinicalDocuments.map((d) => d.id).sort(), "every document is asked about");
    for (const tasks of [clinicalTasks, clinicalHoldoutTasks]) {
      assert.ok(tasks.some((t) => !t.answerable), "a question the papers do not answer");
      assert.ok(tasks.some((t) => t.facts.some((group) => group.includes("did not"))), "a negative result");
    }
    assert.ok(clinicalHoldoutTasks.length >= clinicalTasks.length / 3, "a quarter or more of all is held out");
  });

  it("fails an answer that turns a negative result into a positive one, or gives the wrong unit, and passes right ones", () => {
    const library = new ResearchLibrary(clinicalDocuments.map((d) => ({ id: d.id, title: d.title, text: "" })));
    const result = (answer: string, docId: string): ResearchResult =>
      ({ status: "verified", final: { found: true, answer, evidence: [{ docId, quote: "q" }] }, evidence: [], citations: {}, sourceErrors: [] }) as unknown as ResearchResult;
    const task = (id: string) => [...clinicalTasks, ...clinicalHoldoutTasks].find((t) => t.id === id)!;
    const iron = "iv-iron-pregnancy-malawi";
    assert.equal(scoreResearch(task("c03-iron-anaemia-36-weeks"), result("No. Ferric carboxymaltose did not reduce anaemia at 36 weeks (prevalence ratio 0·92, 95% CI 0·81 to 1·06; p=0·27).", iron), library).passed, true);
    assert.equal(scoreResearch(task("c03-iron-anaemia-36-weeks"), result("Yes. Ferric carboxymaltose reduced anaemia at 36 weeks (prevalence ratio 0.92).", iron), library).passed, false);
    // Task defects fixed in 0.61.0: c03 no longer asks for a ratio its question does not, and "no statistical
    // difference" says a result did not differ (c20). Both are Qwen3.5-4B's answers in the 0.60.0 run.
    assert.equal(scoreResearch(task("c03-iron-anaemia-36-weeks"), result("No, ferric carboxymaltose did not reduce the prevalence of anaemia at 36 weeks' gestation compared with standard of care in the REVAMP trial.", iron), library).passed, true);
    const crp = "crp-community-health-workers";
    assert.equal(scoreResearch(task("c20-crp-clinical-failure"), result("There was no statistical difference in the risk of clinical failure (OR 0.41, 95% CI: 0.09 to 1.83).", crp), library).passed, true);
    const folic = "folic-acid-pregnancy";
    assert.equal(scoreResearch(task("c13-folic-dose"), result("They received 400 µg of folic acid per day.", folic), library).passed, true);
    assert.equal(scoreResearch(task("c13-folic-dose"), result("They received 400 mg of folic acid per day.", folic), library).passed, false);
    const veg = "cruciferous-blood-pressure";
    assert.equal(scoreResearch(task("c08-veg-systolic"), result("It was 2.5 mmHg lower after the cruciferous diet.", veg), library).passed, true);
    assert.equal(scoreResearch(task("c08-veg-systolic"), result("It rose by 2.5 mmHg after the cruciferous diet.", veg), library).passed, false);
  });

  it("runs as its own suite, over its own library", async () => {
    const suite = await loadFieldSuite();
    const quote = "Eligible participants were randomised at the end of their first trimester to receive either 400 µg/day of FA (n = 96) or placebo (n = 94) until the end of pregnancy";
    const answer = JSON.stringify({
      tool: "final_answer",
      args: { found: true, answer: "Women in the intervention group received 400 µg/day of folic acid until the end of pregnancy.", evidence: [{ docId: "folic-acid-pregnancy", quote }] },
    });
    const model = new ScriptedModel([`{"tool":"search","args":{"query":"FASSTT folic acid dose"}}`, `{"tool":"read","args":{"docId":"folic-acid-pregnancy"}}`, answer, answer]);
    const report = await runBenchmark({
      model,
      runner: new NodeCodeRunner(),
      field: suite,
      environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
      config: { suites: ["clinical"], modes: ["constrained"], taskIds: ["c13-folic-dose"] },
    });
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0]!.suite, "clinical");
    assert.equal(report.results[0]!.passed, true, JSON.stringify(report.results[0]!.checks));
  });
});

describe("cs suite", () => {
  it("reads ten CC BY computer science papers as published, tables and equations included, in a library of their own", async () => {
    const suite = await loadFieldSuite();
    assert.equal(csDocuments.length, 10);
    for (const doc of csDocuments) {
      const text = suite.csLibrary.documentFor(doc.id)?.text ?? "";
      assert.match(text, /CC BY|Creative Commons Attribution/, `${doc.id}: its licence is in the document`);
      assert.match(doc.title, /PMC\d+\)$/, `${doc.id}: its title names the article`);
      assert.ok(text.length > 30_000, `${doc.id}: the whole article, not its abstract`);
      assert.match(text, /^\| .+ \|$/m, `${doc.id}: its tables are kept as rows`);
    }
    assert.equal(suite.csLibrary.documents.length, csDocuments.length, "only the CS papers");
    assert.equal(suite.clinicalLibrary.documentFor("fedcode-compression"), undefined, "the clinical library is unchanged");
    // MDPI puts its tables after the article (<floats-group>); each is placed after the paragraph that first cites it.
    const stabfl = suite.csLibrary.documentFor("stabfl-label-skew")!.text;
    assert.match(stabfl, /\| FedProx \| 82\.49±3\.25 \| 82\.44±3\.09 \| 71\.32±3\.67 \| 69\.70±5\.52 \| 76\.90±4\.21 \| 76\.81±4\.29 \| 73\.87±3\.53 \| 72\.37±1\.84 \|/);
    assert.ok(stabfl.indexOf("**Table 4**") > stabfl.indexOf("Table 4 additionally reports"), "a table follows the paragraph that cites it");
    // Powers of ten lose their superscripts, as in a PDF's text layer.
    assert.match(stabfl, /\| CIFAR-10 \| 5 \| 8 \| Adam \| 10−3 \| 10−4 \|/);
    // Displayed equations are kept as their symbols' text, with their number.
    assert.match(suite.csLibrary.documentFor("kd-intrusion-detection")!.text, /^A c c u r a c y = T P \+ T N .*\(12\)$/m);
  });

  it("asks only for facts its cited documents contain, about every document, with a third held out", async () => {
    const suite = await loadFieldSuite();
    for (const task of [...csTasks, ...csHoldoutTasks]) {
      if (!task.answerable) {
        assert.deepEqual([task.facts, task.citations], [[], []], task.id);
        continue;
      }
      const text = normalize(task.citations.flat().map((id) => suite.csLibrary.documentFor(id)!.text).join(" "));
      for (const group of task.facts) assert.ok(group.some((option) => text.includes(normalize(option))), `${task.id}: none of ${JSON.stringify(group)} is in its documents`);
    }
    const cited = new Set(csTasks.flatMap((t) => t.citations.flat()));
    assert.deepEqual([...cited].sort(), csDocuments.map((d) => d.id).sort(), "every document is asked about");
    for (const tasks of [csTasks, csHoldoutTasks]) {
      assert.ok(tasks.some((t) => !t.answerable), "a question the papers do not answer");
      assert.ok(tasks.some((t) => t.facts.some((group) => group.includes("does not"))), "a method that did not improve");
      assert.ok(tasks.some((t) => t.kind === "comparison"), "a question over two papers");
    }
    assert.ok(csHoldoutTasks.length >= csTasks.length / 3, "a quarter or more of all is held out");
  });

  it("fails an answer that turns a negative result into a positive one, or gives the wrong unit or power of ten, and passes right ones", () => {
    const library = new ResearchLibrary(csDocuments.map((d) => ({ id: d.id, title: d.title, text: "" })));
    const result = (answer: string, docId: string): ResearchResult =>
      ({ status: "verified", final: { found: true, answer, evidence: [{ docId, quote: "q" }] }, evidence: [], citations: {}, sourceErrors: [] }) as unknown as ResearchResult;
    const task = (id: string) => [...csTasks, ...csHoldoutTasks].find((t) => t.id === id)!;
    const passes = (id: string, answer: string, docId: string) => scoreResearch(task(id), result(answer, docId), library).passed;
    const fedcode = "fedcode-compression";
    assert.equal(passes("cs03-fedcode-adaptive-tuning", "No. Adaptive coder-parameter tuning does not consistently outperform strong fixed configurations.", fedcode), true);
    assert.equal(passes("cs03-fedcode-adaptive-tuning", "Yes, adaptive tuning outperformed the fixed configurations.", fedcode), false);
    const hce = "longtail-entity-rag";
    assert.equal(passes("cs23-hcerag-hyde", "HyDE underperforms the hybrid baseline (0.6480 against 0.7116).", hce), true);
    assert.equal(passes("cs23-hcerag-hyde", "HyDE improved accuracy over hybrid retrieval.", hce), false);
    const vc = "vcfedadam-verifiable";
    assert.equal(passes("cs10-vcfedadam-user-storage", "Each user stores 80.16 KB.", vc), true);
    assert.equal(passes("cs10-vcfedadam-user-storage", "Each user stores 80.16 MB.", vc), false);
    const stabfl = "stabfl-label-skew";
    for (const answer of ["a learning rate of 10−3 and a weight decay of 10−4", "learning rate 0.001, weight decay 0.0001", "lr = 1e-3 and weight decay 1e-4"]) {
      assert.equal(passes("cs05-stabfl-learning-rate", answer, stabfl), true, answer);
    }
    assert.equal(passes("cs05-stabfl-learning-rate", "a learning rate of 10−4 and a weight decay of 10−5", stabfl), false, "each a power of ten too small");
    const kd = "kd-intrusion-detection";
    assert.equal(passes("cs17-kdids-learning-rate", "An initial learning rate of 5×10−4 and weight decay of 1×10−5.", kd), true);
    assert.equal(passes("cs17-kdids-learning-rate", "An initial learning rate of 0.0005 and weight decay of 0.00001.", kd), true);
    assert.equal(passes("cs17-kdids-learning-rate", "An initial learning rate of 5×10−5 and weight decay of 1×10−4.", kd), false);
  });

  it("runs as its own suite, over its own library", async () => {
    const suite = await loadFieldSuite();
    const quote = "the concrete storage overhead is 80.16 KB for each user, 3.33 KB for each AN, 266.72 KB for the server, and 8.30 MB in total";
    const answer = JSON.stringify({
      tool: "final_answer",
      args: { found: true, answer: "VCFedAdam needs 80.16 KB of storage on each user.", evidence: [{ docId: "vcfedadam-verifiable", quote }] },
    });
    const model = new ScriptedModel([`{"tool":"search","args":{"query":"VCFedAdam storage overhead user"}}`, `{"tool":"read","args":{"docId":"vcfedadam-verifiable"}}`, answer, answer]);
    const report = await runBenchmark({
      model,
      runner: new NodeCodeRunner(),
      field: suite,
      environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
      config: { suites: ["cs"], modes: ["constrained"], taskIds: ["cs10-vcfedadam-user-storage"] },
    });
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0]!.suite, "cs");
    assert.equal(report.results[0]!.passed, true, JSON.stringify(report.results[0]!.checks));
  });
});

describe("chemistry suite", () => {
  it("reads eight CC BY chemistry papers as published, in a library of their own", async () => {
    const suite = await loadFieldSuite();
    assert.equal(chemDocuments.length, 8);
    for (const doc of chemDocuments) {
      const text = suite.chemLibrary.documentFor(doc.id)?.text ?? "";
      assert.ok(text.length > 14_000, `${doc.id}: ${text.length} characters`);
      assert.match(text, /Creative Commons Attribution 4\.0|creativecommons\.org\/licenses\/by\/4\.0/i, `${doc.id}: keeps its licence statement`);
    }
    assert.equal(suite.chemLibrary.documents.filter((d) => !d.id.includes("#")).length, chemDocuments.length, "only the chemistry papers");
    assert.equal(suite.library.documentFor("nickel-fluorobenzofuran-coupling"), undefined, "the field suite's library is unchanged");
    // What these papers are read for survives the converter: a loading and an equivalent, a shift and its coupling
    // constants, a potential with its reference, an enantiomeric ratio, a stereodescriptor.
    const text = (id: string) => suite.chemLibrary.documentFor(id)!.text;
    assert.match(text("nickel-fluorobenzofuran-coupling"), /Ni\(cod\)2 \(10 mol %\)/);
    assert.match(text("nickel-fluorobenzofuran-coupling"), /55\.0 ppm \(JFP = 53, 42 Hz\)/);
    assert.match(text("nickel-photoredox-hydroxytrifluoroethylation"), /−1\.17 V vs SCE/);
    assert.match(text("propargylation-biisoquinoline-dioxide"), /78:22 er/);
    assert.match(text("frustrated-lewis-pairs-co2-capture"), /\(S\)-epoxide/);
  });

  it("asks only for facts its cited documents contain, about every document, with some held out", async () => {
    const suite = await loadFieldSuite();
    for (const task of [...chemTasks, ...chemHoldoutTasks]) {
      if (!task.answerable) {
        assert.deepEqual([task.facts, task.citations], [[], []], task.id);
        continue;
      }
      const text = normalize(task.citations.flat().map((id) => suite.chemLibrary.documentFor(id)!.text).join(" "));
      for (const group of task.facts) assert.ok(group.some((option) => text.includes(normalize(option))), `${task.id}: none of ${JSON.stringify(group)} is in its documents`);
    }
    const ids = [...chemTasks, ...chemHoldoutTasks].map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, "task IDs are unique");
    for (const tasks of [chemTasks, chemHoldoutTasks]) {
      const cited = new Set(tasks.flatMap((t) => t.citations.flat()));
      assert.deepEqual([...cited].sort(), chemDocuments.map((d) => d.id).sort(), "every document is asked about");
      assert.ok(tasks.some((t) => !t.answerable), "a question the papers do not answer");
      assert.ok(tasks.some((t) => t.facts.some((group) => CHEM_NO_EFFECT.every((way) => group.includes(way)))), "a control that showed nothing");
    }
    assert.ok(chemTasks.some((t) => t.kind === "comparison"), "a question over two papers");
    assert.ok(chemHoldoutTasks.length >= chemTasks.length / 4, "a held-out set at least a quarter the size of the open one");
  });

  it("fails an answer that swaps a unit, a descriptor, a name or a direction, and passes right ones", () => {
    const library = new ResearchLibrary(chemDocuments.map((d) => ({ id: d.id, title: d.title, text: "" })));
    const result = (answer: string, docId: string): ResearchResult =>
      ({ status: "verified", final: { found: true, answer, evidence: [{ docId, quote: "q" }] }, evidence: [], citations: {}, sourceErrors: [] }) as unknown as ResearchResult;
    const task = (id: string) => [...chemTasks, ...chemHoldoutTasks].find((t) => t.id === id)!;
    const passes = (id: string, answer: string, docId: string) => scoreResearch(task(id), result(answer, docId), library).passed;
    const cases: Array<[id: string, docId: string, right: string, wrong: string]> = [
      // mol% and equiv swapped: 5 mol% catalyst, 1.2 equiv base.
      ["c01-nif-best-conditions", "nickel-fluorobenzofuran-coupling", "5 mol% Ni(cod)2 with 1.2 equiv K2CO3 gave 98%.", "5 equiv Ni(cod)2 with 1.2 mol% K2CO3 gave 98%."],
      // A chemical shift given in Hz.
      ["c05-nif-eb-fluorine-nmr", "nickel-fluorobenzofuran-coupling", "A broad double doublet at 55.0 ppm with JFP = 53 and 42 Hz.", "A broad double doublet at 55.0 Hz with JFP = 53 and 42 ppm."],
      // A potential with its sign dropped.
      ["c12-nip-nickel-potential", "nickel-photoredox-hydroxytrifluoroethylation", "Ered(NiI/Ni0) = −1.17 V vs SCE.", "Ered(NiI/Ni0) = +1.17 V vs SCE."],
      // The other enantiomer.
      ["c35-flp-enantiomer", "frustrated-lewis-pairs-co2-capture", "The (R) product is favoured, with 96% ee.", "The (S) product is favoured, with 96% ee."],
      // A direction reversed.
      ["c14-prop-narrow-pocket", "propargylation-biisoquinoline-dioxide", "The enantioselectivity consistently decreased.", "The enantioselectivity consistently increased."],
      // Lifetimes in each other's unit.
      ["c24-hel-lifetimes", "polyaza-helicene-photoredox", "The singlet lives 9.6 ns and the triplet about 28 µs.", "The singlet lives 9.6 µs and the triplet about 28 ns."],
      // H-type for J-type aggregates.
      ["c33-por-j-aggregates", "porphyrin-aggregation-co2-reduction", "J-type (staircase) aggregates, from the red-shifted Soret band.", "H-type (face-to-face) aggregates, from a blue-shifted Soret band."],
      // A negative turned into an effect.
      ["c29-cu-no-leaching", "copper-step-edges-co2-reduction", "No: ICP-OES showed no detectable leaching of Cu.", "Yes, about 10% of the copper leached into the electrolyte."],
      // Kelvin read as Celsius.
      ["c37-flp-temperature", "frustrated-lewis-pairs-co2-capture", "At 273.0 K.", "At 273 °C."],
    ];
    for (const [id, docId, right, wrong] of cases) {
      assert.equal(passes(id, right, docId), true, `${id}: ${right}`);
      assert.equal(passes(id, wrong, docId), false, `${id}: ${wrong}`);
    }
  });

  it("runs as its own suite, over its own library", async () => {
    const suite = await loadFieldSuite();
    const answer = JSON.stringify({
      tool: "final_answer",
      args: { found: true, answer: "No: ICP-OES shows no detectable leaching of Cu from the Cu/GNF electrocatalyst.", evidence: [{ docId: "copper-step-edges-co2-reduction", quote: "Analysis of the reaction solution by inductively coupled plasma optical emission spectroscopy (ICP-OES) shows no detectable leaching of Cu from Cu/GNF electrocatalyst." }] },
    });
    const model = new ScriptedModel([`{"tool":"search","args":{"query":"copper leaching Cu/GNF ICP-OES"}}`, `{"tool":"read","args":{"docId":"copper-step-edges-co2-reduction"}}`, answer, answer]);
    const report = await runBenchmark({
      model,
      runner: new NodeCodeRunner(),
      field: suite,
      environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
      config: { suites: ["chem"], modes: ["constrained"], taskIds: ["c29-cu-no-leaching"] },
    });
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0]!.suite, "chem");
    assert.equal(report.results[0]!.passed, true, JSON.stringify(report.results[0]!.checks));
  });
});

describe("lab suite", () => {
  it("reads ten CC BY laboratory biology papers as published, in a library of their own", async () => {
    const suite = await loadFieldSuite();
    assert.equal(labDocuments.length, 10);
    for (const doc of labDocuments) {
      const text = suite.labLibrary.documentFor(doc.id)?.text ?? "";
      assert.ok(text.length > 20_000, `${doc.id}: ${text.length} characters`);
      // The publishers word it differently: eLife names the licence, Elsevier links it ("the CC BY license").
      assert.match(text, /Creative Commons Attribution|creativecommons\.org\/licenses\/by\/4\.0/i, `${doc.id}: keeps its licence statement`);
    }
    assert.equal(suite.labLibrary.documents.length, labDocuments.length, "only the laboratory papers");
    assert.equal(suite.library.documentFor("il10-tolerance-birds"), undefined, "the field suite's library is unchanged");
    // The names these papers are read for survive the converter: a Greek letter, a genotype and a mutant.
    assert.match(suite.labLibrary.documentFor("ppara-brown-adipocytes")!.text, /PPARα/);
    assert.match(suite.labLibrary.documentFor("zebrafish-seizure-zinc")!.text, /5a−\/−/);
    assert.match(suite.labLibrary.documentFor("cabozantinib-p53-y220c")!.text, /p53Y220C/);
    assert.match(suite.labLibrary.documentFor("adp-ribose-methanol-dehydrogenase")!.text, /2\.4 ± 0\.7 μM/);
  });

  it("asks only for facts its cited documents contain, about every document, with a third held out", async () => {
    const suite = await loadFieldSuite();
    for (const task of [...labTasks, ...labHoldoutTasks]) {
      if (!task.answerable) {
        assert.deepEqual([task.facts, task.citations], [[], []], task.id);
        continue;
      }
      const text = normalize(task.citations.flat().map((id) => suite.labLibrary.documentFor(id)!.text).join(" "));
      for (const group of task.facts) assert.ok(group.some((option) => text.includes(normalize(option))), `${task.id}: none of ${JSON.stringify(group)} is in its documents`);
    }
    const cited = new Set(labTasks.flatMap((t) => t.citations.flat()));
    assert.deepEqual([...cited].sort(), labDocuments.map((d) => d.id).sort(), "every document is asked about");
    for (const tasks of [labTasks, labHoldoutTasks]) {
      assert.ok(tasks.some((t) => !t.answerable), "a question the papers do not answer");
      assert.ok(tasks.some((t) => t.facts.some((group) => group.includes("no difference"))), "a control that showed no effect");
    }
    assert.ok(labTasks.some((t) => t.kind === "comparison"), "a question over two papers");
    assert.ok(labHoldoutTasks.length >= labTasks.length / 3, "a quarter or more of all is held out");
  });

  it("fails an answer that reverses a direction, swaps a unit's prefix or names the other isoform, and passes right ones", () => {
    const library = new ResearchLibrary(labDocuments.map((d) => ({ id: d.id, title: d.title, text: "" })));
    const result = (answer: string, docId: string): ResearchResult =>
      ({ status: "verified", final: { found: true, answer, evidence: [{ docId, quote: "q" }] }, evidence: [], citations: {}, sourceErrors: [] }) as unknown as ResearchResult;
    const task = (id: string) => [...labTasks, ...labHoldoutTasks].find((t) => t.id === id)!;
    const passes = (id: string, answer: string, docId: string) => scoreResearch(task(id), result(answer, docId), library).passed;
    // A direction reversed: MRSA strains were more tolerant of daptomycin, not less.
    const meca = "meca-daptomycin-tolerance";
    assert.equal(passes("l09-meca-mrsa-tolerance", "MRSA strains were more tolerant of daptomycin than MSSA strains.", meca), true);
    assert.equal(passes("l09-meca-mrsa-tolerance", "MRSA strains were less tolerant of daptomycin than MSSA strains.", meca), false);
    // A negative result turned into an effect: MIC differences did not explain the tolerance difference.
    assert.equal(passes("l11-meca-mic-explains", "No. Differences in MIC did not explain the difference in tolerance.", meca), true);
    assert.equal(passes("l11-meca-mic-explains", "Yes, the MRSA strains had higher MICs, which explained their tolerance.", meca), false);
    // A unit's prefix swapped: the MIC is 0.5 µg/mL, a thousandfold from 0.5 ng/mL.
    assert.equal(passes("l08-meca-daptomycin-mic", "The vast majority had a MIC of 0.5 µg/mL.", meca), true);
    assert.equal(passes("l08-meca-daptomycin-mic", "The vast majority had a MIC of 0.5 ng/mL.", meca), false);
    // A concentration in the wrong prefix: 10 μM cabozantinib for 48 h, not 10 mM.
    const p53 = "cabozantinib-p53-y220c";
    assert.equal(passes("l24-p53-cabozantinib-concentration", "COV362 cells were treated with 10 μM cabozantinib for 48 h.", p53), true);
    assert.equal(passes("l24-p53-cabozantinib-concentration", "COV362 cells were treated with 10 mM cabozantinib for 48 h.", p53), false);
    // The other point mutant: cabozantinib barely affected p53 R273H, and that is what the question asks.
    assert.equal(passes("l23-p53-r273h-effect", "Cabozantinib had barely any effect on p53 R273H levels.", p53), true);
    assert.equal(passes("l23-p53-r273h-effect", "Cabozantinib induced the degradation of p53 R273H.", p53), false);
    // Two values of one kinetic measurement, the unit on the second, as the clinical suite's doses are.
    const mdh = "adp-ribose-methanol-dehydrogenase";
    for (const answer of ["IC50 values of 4.8 and 2.4 μM, respectively", "4.8 ± 1.0 μM for BmMDH1 and 2.4 ± 0.7 μM for BmMDH2"]) {
      assert.equal(passes("l20-mdh-ic50", answer, mdh), true, answer);
    }
    assert.equal(passes("l20-mdh-ic50", "IC50 values of 4.8 and 2.4 mM, respectively", mdh), false, "the wrong prefix");
  });

  it("runs as its own suite, over its own library", async () => {
    const suite = await loadFieldSuite();
    const quote = "we show that MRSA strains are more tolerant of daptomycin than methicillin-susceptible S. aureus (MSSA) strains";
    const answer = JSON.stringify({
      tool: "final_answer",
      args: { found: true, answer: "MRSA strains were more tolerant of daptomycin than MSSA strains.", evidence: [{ docId: "meca-daptomycin-tolerance", quote }] },
    });
    const model = new ScriptedModel([`{"tool":"search","args":{"query":"MRSA MSSA daptomycin tolerance"}}`, `{"tool":"read","args":{"docId":"meca-daptomycin-tolerance"}}`, answer, answer]);
    const report = await runBenchmark({
      model,
      runner: new NodeCodeRunner(),
      field: suite,
      environment: { runtime: "scripted", modelId: "scripted", contextLength: 4096, hardwareClass: "other", hardware: {} },
      config: { suites: ["lab"], modes: ["constrained"], taskIds: ["l09-meca-mrsa-tolerance"] },
    });
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0]!.suite, "lab");
    assert.equal(report.results[0]!.passed, true, JSON.stringify(report.results[0]!.checks));
  });
});

describe("engineering suite", () => {
  it("reads seven made-up engineering documents, two of them PDFs laid out as real ones, in a library of their own", async () => {
    const suite = await loadFieldSuite();
    assert.equal(engineeringDocuments.length, 7);
    assert.equal(suite.engineeringLibrary.documents.length, engineeringDocuments.length, "only the engineering documents");
    assert.equal(suite.library.documentFor("sic-pfc-paper"), undefined, "the field suite's library is unchanged");
    const datasheet = suite.engineeringLibrary.documentFor("kv1200m040-datasheet")!.text;
    const paper = suite.engineeringLibrary.documentFor("sic-pfc-paper")!.text;
    // The PDFs hold what makes engineering text hard to check: a minus sign and a unit symbol from another
    // font, and a table's rows (eval/engineering/source/make_pdfs.py).
    assert.match(datasheet, /Gate-source voltage, minimum .*8 V/);
    assert.match(datasheet, /1950 pF/);
    assert.match(paper, /20% 97\.1% 0\.991 6\.8%/);
    assert.match(paper, /ZVS was achieved above 35% load/);
    assert.match(suite.engineeringLibrary.documentFor("tensile-tests-6061")!.text, /Test temperature \(°C\): -40 \| Yield strength \(MPa\): 290/);
  });

  it("asks only for facts its cited documents contain, about every document, with a third held out", async () => {
    const suite = await loadFieldSuite();
    for (const task of [...engineeringTasks, ...engineeringHoldoutTasks]) {
      if (!task.answerable) {
        assert.deepEqual([task.facts, task.citations], [[], []], task.id);
        continue;
      }
      const text = normalize(task.citations.flat().map((id) => suite.engineeringLibrary.documentFor(id)!.text).join(" "));
      for (const group of task.facts) assert.ok(group.some((option) => text.includes(normalize(option))), `${task.id}: none of ${JSON.stringify(group)} is in its documents`);
    }
    for (const tasks of [engineeringTasks, engineeringHoldoutTasks]) {
      const cited = new Set(tasks.flatMap((t) => t.citations.flat()));
      assert.deepEqual([...cited].sort(), engineeringDocuments.map((d) => d.id).sort(), "every document is asked about");
      assert.ok(tasks.some((t) => !t.answerable), "a question the documents do not answer");
    }
    assert.ok(engineeringHoldoutTasks.length >= engineeringTasks.length / 3, "a quarter or more of all is held out");
  });
});

describe("physics suite", () => {
  it("reads six made-up physics documents, three of them LaTeX sources, in a library of their own", async () => {
    const suite = await loadFieldSuite();
    assert.equal(physicsDocuments.length, 6);
    assert.equal(suite.physicsLibrary.documents.filter((d) => !d.id.includes("#")).length, physicsDocuments.length, "only the physics documents");
    assert.equal(suite.library.documentFor("kagome-pdw-letter"), undefined, "the field suite's library is unchanged");
    const letter = suite.physicsLibrary.documentFor("kagome-pdw-letter")!.text;
    const search = suite.physicsLibrary.documentFor("zprime-dilepton")!.text;
    const hubble = suite.physicsLibrary.documentFor("hubble-cepheids")!.text;
    const bec = suite.physicsLibrary.documentFor("rb87-bec-paper")!.text;
    // What makes physics text hard: siunitx units, hepunits and the paper's own macros, per-mode=symbol,
    // concise and asymmetric uncertainties, and raised exponents in a PDF.
    assert.match(letter, /At 300 mK the tunneling spectra show a superconducting gap of \$\\Delta = 0\.75\(3\) meV\$/);
    assert.match(letter, /\| S3 \| 1\.7 \| 0\.55\(5\) \| 1\.21\(8\) \| 9 \|/);
    assert.match(search, /using 139 fb⁻¹ of proton–proton collisions at √s = 13 TeV/);
    assert.match(search, /\$1\.05\^\{\+0\.09\}_\{-0\.08\}\$/);
    assert.match(hubble, /The distance to NGC 4258 from the Keplerian motion of its water megamaser is \(7\.58 ± 0\.08\) Mpc\./);
    assert.match(hubble, /higher by 5\.6 km\/\(s Mpc\)/);
    assert.match(bec, /holds 2\.0 × 10⁵ atoms\./);
    assert.match(suite.physicsLibrary.documentFor("pressure-transport")!.text, /pressure_GPa: 1\.0 \| Tc_onset_K: 3\.1/);
  });

  it("asks only for facts its cited documents contain, in their case where it matters, about every document, with a third held out", async () => {
    const suite = await loadFieldSuite();
    for (const task of [...physicsTasks, ...physicsHoldoutTasks]) {
      if (!task.answerable) {
        assert.deepEqual([task.facts, task.citations, task.casedFacts], [[], [], undefined], task.id);
        continue;
      }
      const raw = task.citations.flat().map((id) => suite.physicsLibrary.documentFor(id)!.text).join(" ");
      const text = normalize(raw);
      for (const group of task.facts) assert.ok(group.some((option) => text.includes(normalize(option))), `${task.id}: none of ${JSON.stringify(group)} is in its documents`);
      for (const group of task.casedFacts ?? []) assert.ok(group.some((option) => raw.includes(option)), `${task.id}: none of ${JSON.stringify(group)} is in its documents, in its case`);
    }
    for (const tasks of [physicsTasks, physicsHoldoutTasks]) {
      const cited = new Set(tasks.flatMap((t) => t.citations.flat()));
      assert.deepEqual([...cited].sort(), physicsDocuments.map((d) => d.id).sort(), "every document is asked about");
      assert.ok(tasks.some((t) => !t.answerable), "a question the documents do not answer");
    }
    assert.ok(physicsHoldoutTasks.length >= physicsTasks.length / 3, "a quarter or more of all is held out");
  });
});

describe("mathematics suite", () => {
  it("reads five made-up mathematics documents, three of them LaTeX sources, in a library of their own", async () => {
    const suite = await loadFieldSuite();
    assert.equal(mathDocuments.length, 5);
    // The Vasquez paper's two proofs run over parts, and its last part says whose proof it is only in its note (harness 0.100.0).
    const { chunkDocument } = await import("../src/documents/chunk.ts");
    const vasquez = chunkDocument(suite.mathLibrary.documentFor("vasquez-colourings")!);
    assert.ok(vasquez.length >= 4, "split into parts");
    const last = vasquez.at(-1)!.text;
    assert.match(last, /Step 3\./);
    assert.doesNotMatch(last, /Theorem 4\.1/, "only the note names the proof");
    assert.equal(suite.mathLibrary.documents.filter((d) => !d.id.includes("#")).length, mathDocuments.length, "only the mathematics documents");
    assert.equal(suite.library.documentFor("teller-sets"), undefined, "the field suite's library is unchanged");
    const teller = suite.mathLibrary.documentFor("teller-sets")!.text;
    const odum = suite.mathLibrary.documentFor("odum-flow")!.text;
    const note = suite.mathLibrary.documentFor("ishikawa-note")!.text;
    // What makes mathematics hard to read: statements under the paper's own names, numbered as amsthm
    // numbers them, with counters shared through aliascnt and thmtools, lettered main theorems, tagged
    // hypotheses, equations within sections, an appendix environment, and references to all of them.
    assert.match(teller, /^Theorem 1\.1 \(Main Theorem\)\. Let \$p \\geq 7\$ be a prime\./m);
    assert.match(teller, /^Conjecture 1\.4\. As \$p \\to \\infty\$/m, "a conjecture keeps its heading");
    assert.match(teller, /^Proof of Theorem 1\.1\. Suppose .* By Lemma 3\.1 there is .* By Lemma 3\.2, \$A\$ contains/m);
    assert.match(teller, /^## 3 Proof of Theorem 1\.1$/m);
    assert.match(teller, /^Question 1\. Is the sequence/m);
    assert.match(teller, /^## A A numerical estimate\n\nLemma A\.1\. /m);
    assert.match(teller, /\\overline\{\\widehat\{1_A\}\(\\chi\^3\)\}\. \(2\.1\)$/m);
    assert.match(odum, /^Theorem A\. Let \$d \\geq 3\$/m);
    assert.match(odum, /^\\\|V\\\|_\{L\^\{d\/\(2s\)\}\} < \\frac\{1\}\{8\}\. \(H2\)$/m);
    assert.match(odum, /the Nash-type inequality of Lemma 3\.3 fails, or the critical exponent itself; see Conjecture 5\.3\./);
    assert.match(odum, /^q_\{\*\} = 1 \+ \\frac\{4s\}\{d\+2\}\. \(1\.2\)$/m);
    assert.match(note, /Theorem 2\. For every k ≥ 5, we have I\(k\) ≤ k² − 2\./);
    assert.match(note, /I\(k\) 9 14 23 34 47 not known \(≥ 60\)/);
  });

  it("asks only for facts its cited documents contain, about every document, with a third held out", async () => {
    const suite = await loadFieldSuite();
    for (const task of [...mathTasks, ...mathHoldoutTasks]) {
      if (!task.answerable) {
        assert.deepEqual([task.facts, task.citations, task.casedFacts], [[], [], undefined], task.id);
        continue;
      }
      const text = normalize(task.citations.flat().map((id) => suite.mathLibrary.documentFor(id)!.text).join(" "));
      for (const group of task.facts) assert.ok(group.some((option) => text.includes(normalize(option))), `${task.id}: none of ${JSON.stringify(group)} is in its documents`);
    }
    for (const tasks of [mathTasks, mathHoldoutTasks]) {
      const cited = new Set(tasks.flatMap((t) => t.citations.flat()));
      assert.deepEqual([...cited].sort(), mathDocuments.map((d) => d.id).sort(), "every document is asked about");
      assert.ok(tasks.some((t) => !t.answerable), "a question the documents do not answer");
    }
    assert.ok(mathHoldoutTasks.length >= mathTasks.length / 3, "a third or more as many held out");
  });
});

describe("facts scored in their case (harness 0.91.0)", () => {
  const task = physicsTasks.find((t) => t.id === "ph01-gap")!;
  const library = new ResearchLibrary(physicsDocuments.map((d) => ({ id: d.id, title: d.title, text: "" })));
  const result = (answer: string) =>
    ({ status: "verified", final: { found: true, answer, evidence: [{ docId: "kagome-pdw-letter", quote: "q" }] }, evidence: [], citations: {}, sourceErrors: [] }) as unknown as ResearchResult;

  it("passes meV and millielectronvolts, and fails MeV, which lower case would pass", () => {
    assert.equal(scoreResearch(task, result("The gap of sample S1 is 0.75 meV."), library).passed, true);
    assert.equal(scoreResearch(task, result("The gap of sample S1 is 0.75 millielectronvolts."), library).passed, true);
    const wrong = scoreResearch(task, result("The gap of sample S1 is 0.75 MeV."), library);
    assert.deepEqual([wrong.passed, wrong.checks.facts, wrong.checks.casedFacts], [false, true, false]);
  });
});
