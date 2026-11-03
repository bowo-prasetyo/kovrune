import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listLabel, type SavedAnswer } from "../src/app/research/answers.ts";
import { toSavedReport } from "../src/app/research/report.ts";

const answer = (question: string, status: SavedAnswer["status"], verified: boolean[] = []): SavedAnswer =>
  ({
    id: question,
    question,
    askedAt: "2026-11-03T12:00:00Z",
    model: "m",
    status,
    ...(status === "no-answer" ? { noAnswer: "The model used all its steps." } : { answer: "An answer." }),
    evidence: verified.map((v) => ({ docId: "d", quote: "q", verified: v })),
    citations: {},
    titles: {},
    sourceErrors: [],
    steps: [],
  }) as SavedAnswer;

const report = (sections: SavedAnswer[], planned = 3) =>
  toSavedReport({
    id: "r",
    askedAt: "2026-11-03T12:00:00Z",
    model: "m",
    plan: { title: "Blockchain", sections: ["a?", "b?", "c?", "d?"].slice(0, planned) },
    request: "blockchain",
    sections,
  });

describe("labels in the Past answers list", () => {
  it("shows an answer's own label", () => {
    // UX audit: the list showed only the question, time and model, so a risky answer looked like the others.
    assert.deepEqual(listLabel(answer("q", "verified", [true])), { label: "Quotes found", severity: "found" });
    assert.deepEqual(listLabel(answer("q", "unverified", [false])), { label: "Quotes not found", severity: "danger" });
    assert.deepEqual(listLabel(answer("q", "not-found")), { label: "Not found in your sources", severity: "none" });
    assert.deepEqual(listLabel(answer("q", "no-answer")), { label: "No answer", severity: "none" });
  });

  it("sums up a report by its sections, red when any section's quotes are missing", () => {
    const found = answer("a?", "verified", [true]);
    assert.deepEqual(listLabel(report([found, found, found])), { label: "Report: 3 of 3 sections Quotes found", severity: "found" });
    assert.deepEqual(listLabel(report([found, answer("b?", "no-answer"), found])), {
      label: "Report: 2 of 3 sections Quotes found",
      severity: "check",
    });
    assert.deepEqual(listLabel(report([found, answer("b?", "unverified", [false]), answer("c?", "unverified")])), {
      label: "Report: 1 of 3 sections Quotes found, 2 with quotes missing or not found",
      severity: "danger",
    });
  });

  it("counts unwritten sections against the plan", () => {
    assert.equal(listLabel(report([answer("a?", "verified", [true])])).severity, "check", "2 of 3 sections never written");
    assert.deepEqual(listLabel(report([])), { label: "Report: no sections written", severity: "none" });
    assert.deepEqual(listLabel(report([answer("a?", "no-answer")], 1)), { label: "Report: 0 of 1 section Quotes found", severity: "none" });
  });
});
