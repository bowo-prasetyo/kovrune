// The broad "how" questions asked live (eval/mechanism-model.ts) and how their steps are counted.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { affirmsPremise, mechanismQuestions, premiseQuestions, stepsGiven } from "../eval/mechanism-model.ts";

describe("mechanism questions", () => {
  it("asks how something works, and lists the steps an answer has to name", () => {
    assert.ok(mechanismQuestions.length >= 5);
    for (const task of mechanismQuestions) {
      assert.equal(task.kind, "mechanism");
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

describe("premise questions", () => {
  it("asks whether something is true, and lists the qualifications an answer has to name", () => {
    assert.ok(premiseQuestions.length >= 5);
    for (const task of premiseQuestions) {
      assert.equal(task.kind, "premise");
      assert.match(task.question, /^Is it true that /, `${task.id} asks whether a premise holds`);
      assert.ok(task.steps.length >= 1, `${task.id} has qualifications`);
      for (const group of task.steps) assert.ok(group.length && group.every((spelling) => spelling.trim()), `${task.id} spellings`);
    }
    const ids = [...mechanismQuestions, ...premiseQuestions].map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, "no question shares an ID with another");
  });

  it("sees an answer that opens by agreeing with the premise", () => {
    // The preview user's answer, which a parenthesis defining a closed system backed word for word.
    assert.equal(affirmsPremise("Yes, it is true that blood never leaves the circulation system in humans."), true);
    assert.equal(affirmsPremise("  True. The blood stays inside the vessels."), true);
    assert.equal(affirmsPremise("That is correct, in the sense that the system is closed."), true);
    assert.equal(affirmsPremise("No, this is a myth: brain imaging shows all of the brain is used."), false);
    assert.equal(affirmsPremise("Only as a simplification. Plasma leaves the capillaries continuously."), false);
    assert.equal(affirmsPremise(""), false);
  });

  it("gives the preview user's answer no qualification it did not name", () => {
    const given =
      "Yes, it is true that blood never leaves the circulation system in humans and other vertebrates because they have a closed blood circulatory system. " +
      "In this system, blood remains within a continuous network of arteries, veins, and capillaries, never exiting the vessels to bathe tissues directly. " +
      "This contrasts with open circulatory systems found in some invertebrates (like arthropods), where blood (hemolymph) leaves the vessels and flows freely in body cavities.";
    const blood = premiseQuestions.find((t) => t.id === "p1-blood-never-leaves")!;
    assert.equal(affirmsPremise(given), true);
    // Neither the lymphatics nor the white cells that cross the vessel wall are named.
    assert.equal(stepsGiven(given, blood.steps), 0);
  });
});
