// Right answers that the word-flip contradiction check of harness 0.112.0 took the label from, found by
// the 28 November audit's probes. The check ran ahead of contradictedSupport's own safeguards (the passage
// must cover most of the question; an answer that denies something is not contradicted by a denial), and
// it was taken out in 0.114.0. Each answer here is right and fully backed, and must stay uncontradicted.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contradictedSupport, type SentenceSupport } from "../src/agent/support.ts";

const backed = (answer: string): SentenceSupport => ({ sentences: [{ text: answer, backed: true }], judged: 1, backed: 1 });

const cases: Array<{ name: string; question: string; answer: string; passage: string }> = [
  {
    name: "a negative control next to a positive result",
    question: "Was the assay result positive for the treated samples?",
    answer: "The assay result was positive for the treated samples.",
    passage: "The assay used water as a negative control for the treated samples.",
  },
  {
    name: "a change over time, then the result",
    question: "Did blood pressure decrease after treatment?",
    answer: "Blood pressure decreased after treatment.",
    passage: "Blood pressure increased slightly during the first hour of treatment, before falling.",
  },
  {
    name: "another reaction in earlier work",
    question: "Did temperature increase the reaction rate?",
    answer: "Temperature increased the reaction rate.",
    passage: "In earlier work, temperature decreased the reaction rate of the side reaction.",
  },
  {
    name: "a lower bound, not a lower value",
    question: "Was the yield higher with catalyst B?",
    answer: "The yield was higher with catalyst B.",
    passage: "The lower bound of the yield with catalyst B was not reported.",
  },
];

describe("contradiction check: right answers keep their label", () => {
  for (const { name, question, answer, passage } of cases) {
    it(name, () => {
      const checked = contradictedSupport(backed(answer), [{ docId: "paper", text: passage }], [], () => "Paper", question);
      assert.equal(checked.contradicted, undefined, `"${answer}" was taken as contradicted by "${passage}"`);
    });
  }
});
