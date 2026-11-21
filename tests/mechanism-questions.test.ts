// The broad "how" questions asked live (eval/mechanism-model.ts) and how their steps are counted.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mechanismQuestions, stepsGiven } from "../eval/mechanism-model.ts";

describe("mechanism questions", () => {
  it("asks how something works, and lists the steps an answer has to name", () => {
    assert.ok(mechanismQuestions.length >= 5);
    for (const task of mechanismQuestions) {
      assert.match(task.question, /^How do(es)? /, `${task.id} asks how`);
      assert.ok(task.steps.length >= 2, `${task.id} has steps`);
      for (const group of task.steps) assert.ok(group.length && group.every((s) => s.trim()), `${task.id} spellings`);
    }
    assert.equal(new Set(mechanismQuestions.map((t) => t.id)).size, mechanismQuestions.length);
  });

  it("counts a step group once, in any of its spellings and in any case", () => {
    const steps = [["pump", "contracts"], ["pressure"], ["arter", "vein"]];
    assert.equal(stepsGiven("The heart contracts, raising the Pressure in the arteries.", steps), 3);
    assert.equal(stepsGiven("The heart pumps and contracts.", steps), 1, "one group, not one per spelling");
    assert.equal(stepsGiven("The circulatory system is a system of organs.", steps), 0);
  });

  it("gives the preview user's answer no step it did not name", () => {
    // The four sentences that were labelled "✓ Quotes found": what the system is, has and carries.
    const given =
      "In vertebrates, the circulatory system is a system of organs that includes the heart, blood vessels, and blood which is circulated throughout the body. " +
      "The circulatory system has two divisions: a systemic circulation or circuit, and a pulmonary circulation or circuit. " +
      "The circulatory system is closed in vertebrates, which means that the blood never leaves the network of blood vessels. " +
      "Blood is circulated around the body carrying oxygen and nutrients to the tissues and collecting and disposing of waste materials.";
    const blood = mechanismQuestions.find((t) => t.id === "m1-blood-circulation")!;
    // Only the vessels group: no pump or contraction, and no pressure.
    assert.equal(stepsGiven(given, blood.steps), 1);
  });
});
