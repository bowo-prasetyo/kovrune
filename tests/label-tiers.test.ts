import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { answerToMarkdown, type SavedAnswer } from "../src/app/research/answers.ts";
import { describeStatus, LABEL_TIERS, labelTier } from "../src/app/research/trace.ts";

// What readers see first is one of three verdicts; the precise label is one click away (trace.ts LABEL_TIERS).
describe("label tiers", () => {
  it("gives every precise label one of three verdicts", () => {
    const cases: Array<[Parameters<typeof describeStatus>, string]> = [
      [["verified", [{ verified: true }], { judged: 1, backed: 1, review: "yes" }], "Backed by quotes"],
      [["verified", [{ verified: true }], { judged: 1, backed: 1, review: "partly" }], "Needs checking"],
      [["verified", [{ verified: true }], { judged: 2, backed: 1 }], "Needs checking"],
      [["verified", [{ verified: true }], { judged: 0, backed: 0 }], "Needs checking"],
      [["verified", [{ verified: true }, { verified: false }]], "Not backed"],
      [["unverified", [{ verified: false }]], "Not backed"],
      [["unverified", []], "Not backed"],
    ];
    for (const [args, headline] of cases) {
      const status = describeStatus(...args);
      assert.equal(labelTier(status).headline, headline, status.label);
      assert.ok(labelTier(status).precise, "the precise label stays available");
    }
  });

  it("heads only the Quotes found label with Backed by quotes, so the false reassurance rate keeps its meaning", () => {
    const found = describeStatus("verified", [{ verified: true }], { judged: 1, backed: 1, review: "yes" });
    assert.equal(found.label, "Quotes found");
    assert.equal(labelTier(found).headline, LABEL_TIERS.found.headline);
    assert.match(LABEL_TIERS.found.summary, /not that the answer is right/);
  });

  it("shows no answer as it is, with nothing to expand", () => {
    const tier = labelTier(describeStatus("not-found", []));
    assert.deepEqual(tier, { headline: "Not found in your sources", summary: "The model did not find the answer in the sources it searched.", precise: false });
  });

  it("exports the verdict first and the precise label after it", () => {
    const answer = {
      id: "a", question: "q?", askedAt: "2026-11-27T00:00:00.000Z", model: "m", status: "verified", answer: "Fifty.",
      evidence: [{ docId: "d", quote: "Fifty.", verified: true }], citations: {}, titles: {}, sourceErrors: [], steps: [],
      support: { judged: 0, backed: 0, sentences: [] },
    } as unknown as SavedAnswer;
    const md = answerToMarkdown(answer);
    assert.match(md, /\*\*Needs checking\.\*\* The quotes are real/);
    assert.match(md, /Why: \*\*Quotes found, answer too short to check\.\*\*/);
  });
});
