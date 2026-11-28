import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessClaimEvidence, findSemanticConflicts, interpretScientificTable, reconcileClaims, reportSectionState, summarizeMixedLibrary, verifyArithmetic } from "../src/agent/trustworthiness.ts";

describe("conservative semantic contradiction detection", () => {
  it("detects an explicit opposing direction for the same claim and quantity", () => {
    const conflicts = findSemanticConflicts(
      "The treatment increased the measured concentration by 15%.",
      [{ docId: "paper-a", text: "The treatment decreased the measured concentration by 15%." }],
    );
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]!.relation, "direction");
    assert.equal(conflicts[0]!.docId, "paper-a");
  });

  it("does not conflate different time points", () => {
    assert.deepEqual(findSemanticConflicts(
      "The treatment increased the measured concentration by 15% at 12 weeks.",
      [{ docId: "paper-a", text: "The treatment decreased the measured concentration by 15% at 24 weeks." }],
    ), []);
  });

  it("does not flag a different quantity or a different topic", () => {
    assert.deepEqual(findSemanticConflicts(
      "The treatment increased the measured concentration by 15%.",
      [{ docId: "paper-a", text: "The treatment decreased the measured concentration by 12%." }],
    ), []);
    assert.deepEqual(findSemanticConflicts(
      "The treatment increased the measured concentration by 15%.",
      [{ docId: "paper-a", text: "The control group decreased the measured temperature by 15%." }],
    ), []);
  });

  it("recognizes explicit significance disagreement", () => {
    const conflicts = findSemanticConflicts(
      "The intervention produced a statistically significant difference.",
      [{ docId: "paper-a", text: "The intervention produced no significant difference." }],
    );
    assert.equal(conflicts[0]?.relation, "significance");
  });

  it("does not treat the exact quoted passage as an independent contradiction", () => {
    const passage = "The treatment decreased the measured concentration by 15%.";
    assert.deepEqual(findSemanticConflicts(
      "The treatment increased the measured concentration by 15%.",
      [{ docId: "paper-a", text: passage }],
      [passage],
    ), []);
  });
});

describe("research trustworthiness primitives", () => {
  it("reconciles conflicting claims only within the same condition", () => {
    const conflicts = reconcileClaims([
      { subject: "enzyme activity", predicate: "direction", value: "increased", condition: "37 C", sourceId: "a" },
      { subject: "enzyme activity", predicate: "direction", value: "decreased", condition: "37 C", sourceId: "b" },
      { subject: "enzyme activity", predicate: "direction", value: "decreased", condition: "25 C", sourceId: "c" },
    ]);
    assert.equal(conflicts.length, 1);
    assert.deepEqual(conflicts[0]!.sourceIds, ["a", "b"]);
  });

  it("requires one source to support the claim's terms, quantities and polarity", () => {
    assert.equal(assessClaimEvidence("Treatment reduced concentration by 15%.", "Treatment reduced concentration by 15%.").supported, true);
    assert.equal(assessClaimEvidence("Treatment reduced concentration by 15%.", "Treatment reduced concentration by 5%.").reason, "quantity-mismatch");
    assert.equal(assessClaimEvidence("Treatment did not reduce concentration.", "Treatment reduced concentration.").reason, "polarity-mismatch");
    assert.equal(assessClaimEvidence("Treatment reduced concentration significantly.", "The unrelated control showed reduced activity.").supported, false);
  });

  it("recomputes derived values independently and refuses incompatible units", () => {
    assert.equal(verifyArithmetic({ operation: "percent-change", operands: [{ value: 100, unit: "mg" }, { value: 115, unit: "mg" }], claimed: { value: 15, unit: "%" } }).valid, true);
    assert.equal(verifyArithmetic({ operation: "sum", operands: [{ value: 2, unit: "mg" }, { value: 3, unit: "mg" }], claimed: { value: 6, unit: "mg" } }).reason, "wrong-result");
    assert.equal(verifyArithmetic({ operation: "sum", operands: [{ value: 2, unit: "mg" }, { value: 3, unit: "g" }], claimed: { value: 5, unit: "mg" } }).reason, "unit-mismatch");
  });

  it("does not call a planned or empty report section evidence-backed", () => {
    assert.equal(reportSectionState({ sectionId: "s1", researched: false, evidenceCount: 0, independentSourceCount: 0, requiredClaims: 2, supportedClaims: 0, contradictory: false }), "not-researched");
    assert.equal(reportSectionState({ sectionId: "s1", researched: true, evidenceCount: 0, independentSourceCount: 0, requiredClaims: 2, supportedClaims: 0, contradictory: false }), "no-evidence");
    assert.equal(reportSectionState({ sectionId: "s1", researched: true, evidenceCount: 2, independentSourceCount: 2, requiredClaims: 2, supportedClaims: 1, contradictory: false }), "insufficient-evidence");
    assert.equal(reportSectionState({ sectionId: "s1", researched: true, evidenceCount: 2, independentSourceCount: 2, requiredClaims: 2, supportedClaims: 2, contradictory: true }), "contradictory-evidence");
    assert.equal(reportSectionState({ sectionId: "s1", researched: true, evidenceCount: 2, independentSourceCount: 2, requiredClaims: 2, supportedClaims: 2, contradictory: false }), "evidence-backed");
  });

  it("keeps scientific table values attached to their column headers", () => {
    const [row] = interpretScientificTable({ headers: ["Sample", "Mean", "SD"], rows: [["A", "12.5 mg/L", "0.4 mg/L"]] });
    assert.deepEqual(row!.values.Mean, { text: "12.5 mg/L", numeric: 12.5, unit: "mg/L" });
    assert.equal(row!.values.Sample!.text, "A");
  });

  it("reports macro and task-weighted retrieval results across mixed suites", () => {
    const summary = summarizeMixedLibrary([
      { suite: "physics", tasks: 10, documentRecall: 1, passageRecall: 1, complete: 1 },
      { suite: "chemistry", tasks: 90, documentRecall: 0.5, passageRecall: 0.4, complete: 0.3 },
    ]);
    assert.equal(summary.macro.documentRecall, 0.75);
    assert.equal(summary.pooled.documentRecall, 0.55);
    assert.equal(summary.suites.length, 2);
  });
});
