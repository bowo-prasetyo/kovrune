// Where to check a marked sentence (harness 0.102.0): the passages of the documents the model read that share
// the most of its words, for each ⚠ sentence that is in no source word for word.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { closestPassages, inSourceSupport, sentenceSupport } from "../src/agent/support.ts";
import { answerToMarkdown, type SavedAnswer } from "../src/app/research/answers.ts";
import { unquotedNote } from "../src/app/research/trace.ts";

// From a preview user's answer and the paper it read (arXiv 2502.07772), shortened.
const PAPER = [
  "In this paper, we present the LLM-GP-BT technique that leverages the Large Language Model (LLM) and Genetic Programming (GP) to automate the generation and configuration of BTs.",
  "Due to the phenomenon of hallucination, LLMs may generate varying BTs differently when given the same input prompt multiple times.",
  "Thus, LLMs may generate inconsistent different fitness level BTs in each usage.",
  "The LLM-generated BTs serve as the initial population for the GP evolution process.",
  "New generations of programs are created through genetic operations such as crossover or mutation.",
  "The weather in the laboratory was not recorded.",
].join(" ");
const TITLE = "Automatic Robot Task Planning by Integrating Large Language Model with Genetic Programming";
const titleFor = () => TITLE;
const quote = { docId: "paper", quote: "In this paper, we present the LLM-GP-BT technique that leverages the Large Language Model (LLM) and Genetic Programming (GP) to automate the generation and configuration of BTs.", verified: true };
const ANSWER =
  "LLMs generate initial populations of BTs, which addresses issues like hallucination and inconsistency. GP then applies genetic operations such as crossover and mutation to the BTs. The robots were tested on Mars in 2031.";

const check = (answer: string) => {
  const support = sentenceSupport(answer, [quote], titleFor);
  const documents = [{ docId: "paper", text: PAPER }];
  return closestPassages(inSourceSupport(support, documents, titleFor), documents, titleFor);
};

describe("the closest passages for a marked sentence", () => {
  const support = check(ANSWER);
  const [first, second, third] = support.sentences;

  it("leaves every label and count as it was", () => {
    assert.deepEqual([first!.backed, second!.backed, third!.backed], [false, false, false]);
    assert.equal(support.backed, 0);
  });

  it("gives the passage nearest each claim of the sentence, the second adding words the first lacks", () => {
    const passages = first!.closest!.map((c) => c.passage);
    assert.equal(passages.length, 2);
    assert.ok(passages.some((p) => p.startsWith("Due to the phenomenon of hallucination")), passages.join(" | "));
    assert.ok(passages.some((p) => p.includes("initial population") || p.includes("inconsistent")), passages.join(" | "));
    assert.equal(first!.closest![0]!.title, TITLE);
    assert.equal(second!.closest![0]!.passage, "New generations of programs are created through genetic operations such as crossover or mutation.");
  });

  it("gives none when no passage shares enough of the sentence's words", () => {
    assert.equal(third!.closest, undefined);
  });

  it("gives none for a backed sentence, or one found in the source word for word", () => {
    const backed = check("The LLM-GP-BT technique leverages the Large Language Model and Genetic Programming to automate the generation and configuration of BTs.");
    assert.equal(backed.sentences[0]!.backed, true);
    assert.equal(backed.sentences[0]!.closest, undefined);
    const verbatim = check("Due to the phenomenon of hallucination, LLMs may generate varying BTs differently when given the same input prompt multiple times.");
    assert.ok(verbatim.sentences[0]!.inSource);
    assert.equal(verbatim.sentences[0]!.closest, undefined);
  });

  it("says where to check under the label, and lists the passages in the Markdown export", () => {
    assert.match(unquotedNote(support), /the closest passages the model read are listed under the answer/);
    const saved = {
      id: "a", question: "How synergize LLMs and Genetic Programming?", askedAt: "2026-11-20T00:00:00Z", model: "m", status: "verified",
      answer: ANSWER, evidence: [quote], support, citations: {}, titles: { paper: TITLE }, sourceErrors: [], steps: [],
    } as unknown as SavedAnswer;
    const markdown = answerToMarkdown(saved);
    assert.match(markdown, /Where to check the ⚠ sentences: the closest passages the model read, not quotes, which may not back them\.\n\n1\. ⚠ LLMs generate initial populations/);
    assert.match(markdown, /   > Due to the phenomenon of hallucination, LLMs may generate varying BTs differently when given the same input prompt multiple times\. \(Automatic Robot Task Planning/);
  });
});
