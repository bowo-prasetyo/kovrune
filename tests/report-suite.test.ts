import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reportHoldoutTasks, reportTasks } from "../eval/field/reports.ts";
import { loadFieldSuite } from "../eval/harness/field.ts";
import { givesFacts, joinsTwoThings, matchSection, scoreReport, sumScores, type WrittenSection } from "../eval/harness/report-score.ts";

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ");

describe("the report suite (docs/report-mode.md, slice 4)", () => {
  it("asks only for facts its cited documents contain", async () => {
    const field = await loadFieldSuite();
    for (const task of [...reportTasks, ...reportHoldoutTasks]) {
      for (const section of task.sections) {
        const text = normalize(section.citations.flat().map((id) => field.library.documentFor(id)!.text).join(" "));
        for (const group of section.facts) assert.ok(group.some((o) => text.includes(normalize(o))), `${task.id}, ${section.name}: none of ${JSON.stringify(group)}`);
      }
    }
  });

  it("holds out a third of the reports, with unique IDs and three or four sections each", () => {
    const all = [...reportTasks, ...reportHoldoutTasks];
    assert.equal(new Set(all.map((t) => t.id)).size, all.length);
    assert.ok(reportHoldoutTasks.length * 3 >= all.length);
    for (const task of all) {
      assert.ok(task.sections.length >= 3 && task.sections.length <= 4, task.id);
      for (const s of task.sections) assert.ok(s.keywords.length > 0 && s.facts.length > 0, `${task.id}, ${s.name}`);
    }
  });
});

describe("scoring a report", () => {
  const task = reportTasks.find((t) => t.id === "rp05-ada")!;
  const section = (question: string, answer: string, quotesFound = true): WrittenSection => ({ question, answer, quotesFound, status: "verified", calls: 3, ms: 1000 });

  it("matches a plan question to the section whose keywords it contains most, or to none", () => {
    assert.equal(task.sections[matchSection("Who were Ada Lovelace's parents and what was her early life like?", task.sections)!]!.name, "family");
    assert.equal(task.sections[matchSection("What did Lovelace's notes on Babbage's engine describe?", task.sections)!]!.name, "work with Babbage");
    assert.equal(matchSection("Which programming language is named after her?", task.sections), undefined);
  });

  it("scores coverage, right and wrongly labelled sections, and unmatched ones", () => {
    const plan = { sections: ["Who were her parents?", "What did her notes on Babbage's engine calculate?", "Whom did she marry?", "Which language is named after her?"] };
    const score = scoreReport(task, plan, [
      section(plan.sections[0]!, "Her father was Lord Byron."),
      section(plan.sections[1]!, "They calculated prime numbers."),
      section(plan.sections[2]!, "She married William King in 1835.", false),
      section(plan.sections[3]!, "Ada.", true),
    ]);
    assert.deepEqual(
      { planCovered: score.planCovered, covered: score.covered, matched: score.matched, right: score.right, labelled: score.labelled, labelledWrong: score.labelledWrong, unmatched: score.unmatched, unmatchedLabelled: score.unmatchedLabelled },
      { planCovered: 3, covered: 2, matched: 3, right: 2, labelled: 2, labelledWrong: 1, unmatched: 1, unmatchedLabelled: 1 },
    );
    assert.equal(score.calls, 12);
    assert.deepEqual(sumScores([score, score]).right, 4);
  });

  it("checks facts as a field task does, and notices questions that join two things", () => {
    assert.equal(givesFacts("Born to Lord  BYRON.", task.sections[0]!), true);
    assert.equal(givesFacts("Born in 1815.", task.sections[0]!), false);
    assert.equal(joinsTwoThings("What is the definition and technical architecture of blockchain?"), true);
    assert.equal(joinsTwoThings("How are blocks linked?"), false);
  });
});
