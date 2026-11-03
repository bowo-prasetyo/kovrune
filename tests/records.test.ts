import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SavedAnswer } from "../src/app/research/answers.ts";
import { answerSchema, confirmDamagedDeletion, damagedFileName, describeDamaged, documentSchema, readable, taskSchema } from "../src/app/research/records.ts";
import { toSavedReport } from "../src/app/research/report.ts";

const answer = (id: string): SavedAnswer => ({
  id,
  question: "What was the total income in 2024?",
  askedAt: "2026-11-03T12:00:00Z",
  model: "Qwen3.5-4B on llama.cpp server",
  status: "verified",
  answer: "4.2 million euros.",
  evidence: [{ docId: "report", quote: "The total income in 2024 was 4.2 million euros.", verified: true }] as SavedAnswer["evidence"],
  citations: {},
  titles: { report: "Annual report" },
  sourceErrors: [],
  steps: ["Searching your documents for “income”: 1 document"],
});

describe("saved records that can't be read", () => {
  it("keeps readable answers and reports as saved, and sets damaged ones aside", () => {
    // UX audit: one saved answer without "evidence" crashed the page on every reload.
    const report = toSavedReport({
      id: "r",
      askedAt: "2026-11-03T12:00:00Z",
      model: "m",
      plan: { title: "Tessel in 2024", sections: ["a?", "b?"] },
      request: "Tessel",
      sections: [answer("s1"), answer("s2")],
    });
    const { evidence: _, ...noEvidence } = answer("broken");
    const badSection = { ...report, id: "r2", report: { ...report.report!, sections: [{ ...answer("s3"), steps: undefined }] } };
    const { records, damaged } = readable<SavedAnswer>([answer("a"), noEvidence, report, badSection, null, "text"], answerSchema);
    assert.deepEqual(records.map((r) => r.id), ["a", "r"]);
    assert.equal(damaged.length, 4);
  });

  it("checks documents and the question in progress", () => {
    const doc = { id: "report", title: "Report", text: "…", fileName: "report.pdf", kind: "pdf", bytes: 1200, pages: 3, pageStarts: [0, 1, 2] };
    assert.equal(readable([doc, { ...doc, id: "x", text: undefined }], documentSchema).records.length, 1);
    // A task saved before arXiv was a source has no "arxiv" preference, and must still continue.
    const task = {
      id: "current",
      question: "q",
      prefs: { wikipedia: false, language: "en", openalex: false },
      documentIds: ["report"],
      setup: "m",
      calls: [{ input: "abc", output: "{}" }],
      steps: [],
      startedAt: "2026-11-03T12:00:00Z",
      updatedAt: "2026-11-03T12:01:00Z",
    };
    assert.equal(readable([task], taskSchema).records.length, 1);
    assert.equal(readable([{ ...task, calls: "lost" }], taskSchema).damaged.length, 1);
  });

  it("says what is missing, and asks before deleting it", () => {
    assert.equal(
      describeDamaged(1, "answer"),
      "1 saved answer can't be read, so it isn't shown. It may have been damaged in the browser's storage, or saved by a newer version of Kovrune. Save it to a file to keep a copy or to report the problem.",
    );
    assert.match(describeDamaged(2, "document"), /^2 saved documents can't be read, so they aren't shown\. They may/);
    assert.equal(confirmDamagedDeletion(2, "answer"), "Delete 2 saved answers that can't be read? This can't be undone; Save to a file keeps a copy first.");
    assert.equal(damagedFileName("answer", new Date("2026-11-03T12:00:00Z")), "kovrune-damaged-answers-2026-11-03.json");
  });
});
