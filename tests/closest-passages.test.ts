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

// Why a passage setting two claims against each other is kept out of inSource, measured on a preview
// user's "Is it true that blood never leaves the circulation system? Why?" (harness 0.106.0). Its answer's
// third sentence gave the open-circulation contrast that the quoted sentence's own second half makes, and
// was marked, since the "While …" sentence is no inSource candidate. Allowing such a passage for a
// sentence that is itself a contrast was tried and is not adopted: the word checks cannot tell the
// faithful contrast from one that swaps the two sides over, so the same passage would credit all three
// sentences below as being in the source. The closest-passages panel shows it either way (above), which
// is where the reader checks a sentence like this.
describe("a passage that sets two claims against each other", () => {
  const PASSAGE =
    "While humans, as well as other vertebrates, have a closed blood circulatory system, some invertebrate groups have an open circulatory system in which the blood, called hemolymph, leaves the vessels and bathes the organs in body cavities.";
  const credited = (sentence: string) => {
    const support = sentenceSupport(sentence, [{ docId: "w", quote: PASSAGE, verified: true }], () => "Circulatory system");
    return support.judged > 0 && support.backed === support.judged;
  };

  it("would back a sentence that reverses it as readily as one that follows it", () => {
    assert.equal(credited("This contrasts with open circulatory systems found in some invertebrates, where the blood, called hemolymph, leaves the vessels and bathes the organs in body cavities."), true);
    assert.equal(credited("Unlike invertebrates, humans have an open circulatory system in which the blood, called hemolymph, leaves the vessels and bathes the organs in body cavities."), true, "the reverse, on the same words");
    assert.equal(credited("While invertebrate groups have a closed blood circulatory system, humans and other vertebrates have an open circulatory system."), true, "the two sides swapped over");
  });

  it("is no inSource candidate, whether or not the sentence is itself a contrast", () => {
    const answer =
      "In this system, blood remains within a continuous network of arteries, veins, and capillaries, never exiting the vessels to bathe tissues directly. " +
      "This contrasts with open circulatory systems found in some invertebrates, where the blood, called hemolymph, leaves the vessels and bathes the organs in body cavities.";
    const quote = "While humans, as well as other vertebrates, have a closed blood circulatory system (meaning that the blood never leaves the network of arteries, veins and capillaries)";
    const titleFor = () => "Circulatory system";
    const documents = [{ docId: "w", text: `Circulatory system\n\n${PASSAGE}\n\nThe blood is pumped by the heart around the body.` }];
    const support = inSourceSupport(sentenceSupport(answer, [{ docId: "w", quote, verified: true }], titleFor), documents, titleFor);
    assert.deepEqual(support.sentences.map((x) => Boolean(x.inSource)), [false, false]);
    // The reader is not left without it: the panel keeps contrast passages, and gives this one for the
    // contrast sentence. (The first sentence shares too few of its words with this shortened article.)
    const shown = closestPassages(support, documents, titleFor);
    assert.match(shown.sentences[1]!.closest![0]!.passage, /^While humans/);
  });
});
