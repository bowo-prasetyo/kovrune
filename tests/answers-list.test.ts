import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SavedAnswer } from "../src/app/research/answers.ts";
import { describeCount, filterAnswers, RECENT_COUNT, recentAnswers } from "../src/app/research/answers-list.ts";
import { toSavedReport } from "../src/app/research/report.ts";

const answer = (id: string, question: string, status: SavedAnswer["status"] = "verified", verified = [true], text = "An answer."): SavedAnswer =>
  ({
    id,
    question,
    askedAt: "2026-11-03T12:00:00Z",
    model: "m",
    status,
    ...(status === "no-answer" ? { noAnswer: "The model used all its steps." } : { answer: text }),
    evidence: verified.map((v) => ({ docId: "d", quote: "q", verified: v })),
    citations: {},
    titles: {},
    sourceErrors: [],
    steps: [],
  }) as SavedAnswer;

// Oldest first, as they are saved.
const saved = [
  answer("a", "What was the total income in 2024?", "verified", [true], "4.2 million euros."),
  answer("b", "Wann wurde die Énergie-Abteilung gegründet?", "unverified", [false]),
  answer("c", "Who chairs the board?", "no-answer"),
  toSavedReport({
    id: "r",
    askedAt: "2026-11-03T12:00:00Z",
    model: "m",
    plan: { title: "Tessel in 2024", sections: ["How is it funded?"] },
    request: "the Tessel Foundation",
    sections: [answer("s", "How is it funded?", "verified", [true], "By donations and grants.")],
  }),
];
const ids = (list: SavedAnswer[]) => list.map((a) => a.id);

describe("the Past answers page", () => {
  it("lists answers newest first", () => {
    assert.deepEqual(ids(filterAnswers(saved, "", "all")), ["r", "c", "b", "a"]);
  });

  it("finds answers by every word typed, in questions, answers and reports, ignoring case and accents", () => {
    assert.deepEqual(ids(filterAnswers(saved, "income 2024", "all")), ["a"]);
    assert.deepEqual(ids(filterAnswers(saved, "MILLION euros", "all")), ["a"], "in the answer");
    assert.deepEqual(ids(filterAnswers(saved, "energie", "all")), ["b"], "without the accent");
    assert.deepEqual(ids(filterAnswers(saved, "donations", "all")), ["r"], "in a report's section");
    assert.deepEqual(ids(filterAnswers(saved, "income board", "all")), [], "every word must match");
  });

  it("filters by label", () => {
    assert.deepEqual(ids(filterAnswers(saved, "", "found")), ["r", "a"]);
    assert.deepEqual(ids(filterAnswers(saved, "", "danger")), ["b"]);
    assert.deepEqual(ids(filterAnswers(saved, "", "none")), ["c"]);
    assert.deepEqual(ids(filterAnswers(saved, "", "reports")), ["r"]);
    assert.deepEqual(ids(filterAnswers(saved, "income", "danger")), []);
  });

  it("says how many answers are shown", () => {
    assert.equal(describeCount(4, 4), "4 answers");
    assert.equal(describeCount(1, 1), "1 answer");
    assert.equal(describeCount(2, 4), "2 of 4 answers");
  });
});

describe("recent answers on the research screen", () => {
  it("lists only the latest few, newest first, without the answer shown above them", () => {
    // UX audit: every past answer was listed on the research screen, which grew without end.
    assert.equal(RECENT_COUNT, 3);
    assert.deepEqual(ids(recentAnswers(saved)), ["r", "c", "b"]);
    assert.deepEqual(ids(recentAnswers(saved, "r")), ["c", "b", "a"]);
    assert.deepEqual(ids(recentAnswers([])), []);
  });
});
