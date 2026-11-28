import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findSemanticConflicts } from "../src/agent/trustworthiness.ts";

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
