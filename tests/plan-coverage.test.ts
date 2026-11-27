import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describePrediction, predictFromCoverage, type WrittenSection } from "../eval/harness/report-score.ts";
import type { ReportTask } from "../eval/field/reports.ts";

// The plan screen's source check is judged by whether it predicts section results, not by being shown.
const task: ReportTask = {
  id: "t",
  request: "Write a report on the server.",
  sections: [
    { name: "download", keywords: ["download"], facts: [["2.6 GB"]], citations: [["guide"]] },
    { name: "start", keywords: ["start"], facts: [["4096"]], citations: [["guide"]] },
    { name: "licence", keywords: ["licence"], facts: [["MPL"]], citations: [["mpl"]] },
  ],
};
const section = (question: string, answer: string, quotesFound = false): WrittenSection => ({ question, answer, quotesFound, status: "verified", calls: 1, ms: 1 });

describe("plan source check against section results", () => {
  it("puts each matched section in the class of its hint and counts its result", () => {
    const p = predictFromCoverage(
      task,
      [
        { question: "How big is the download?", matches: [{ docId: "guide" }] },
        { question: "How do I start it?", matches: [{ docId: "design" }] },
        { question: "What licence is it under?", matches: [] },
        { question: "Who wrote it?", matches: [{ docId: "guide" }] },
      ],
      [
        section("How big is the download?", "It is 2.6 GB."),
        section("How do I start it?", "Run it.", true),
        section("What licence is it under?", "MPL 2.0."),
        section("Who wrote it?", "Ada."),
      ],
    );
    assert.deepEqual(p.expected, { sections: 1, right: 1, labelledWrong: 0 });
    assert.deepEqual(p.elsewhere, { sections: 1, right: 0, labelledWrong: 1 }, "labelled Quotes found without the facts");
    assert.deepEqual(p.empty, { sections: 1, right: 1, labelledWrong: 0 }, "no passage surfaced, and still right");
    assert.equal(p.unmatched, 1);
    assert.match(describePrediction(p), /no passage surfaced: 1 section, 1 right \(100%\)/);
  });

  it("treats a section without a recorded hint as one where nothing surfaced", () => {
    const p = predictFromCoverage(task, [], [section("How big is the download?", "Small.")]);
    assert.deepEqual(p.empty, { sections: 1, right: 0, labelledWrong: 0 });
  });
});
