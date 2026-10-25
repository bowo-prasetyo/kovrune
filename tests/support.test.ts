import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { sentenceSupport, splitSentences } from "../src/agent/support.ts";
import { describeStatus } from "../src/app/research/trace.ts";

const ADA = readFileSync(new URL("./fixtures/ada-lovelace-lead.txt", import.meta.url), "utf8");
const ADA_FIRST = ADA.slice(0, ADA.indexOf(". ") + 1);

/** Which sentences are marked: "+" backed, "-" not backed, "." too short to judge. */
const marks = (answer: string, quotes: Array<{ docId: string; quote: string; verified?: boolean }>, titleFor?: (id: string) => string) =>
  sentenceSupport(
    answer,
    quotes.map((q) => ({ verified: true, ...q })),
    titleFor,
  )
    .sentences.map((s) => (s.backed === undefined ? "." : s.backed ? "+" : "-"))
    .join("");

describe("sentence splitting", () => {
  it("keeps abbreviations, version numbers and list items whole", () => {
    assert.deepEqual(splitSentences("She wrote Algorithm No. 62 for it. LumenDB 3.2.0 fixed it!"), [
      "She wrote Algorithm No. 62 for it. ",
      "LumenDB 3.2.0 fixed it!",
    ]);
    assert.deepEqual(splitSentences("It was released in 2024. It added a fix."), ["It was released in 2024. ", "It added a fix."]);
    assert.deepEqual(splitSentences("Steps:\n1. Open the Papyrus perspective.\n2. Create a project"), [
      "Steps:\n",
      "1. Open the Papyrus perspective.\n",
      "2. Create a project",
    ]);
  });

  it("joins back into the answer exactly", () => {
    const answer = "First sentence here.  Second one?\n\n“Quoted” third. (Fourth.)";
    assert.equal(splitSentences(answer).join(""), answer);
  });
});

describe("sentence support", () => {
  it("marks claims next to a real quote that does not back them (fifth live check)", () => {
    // "How does LLM think?": the one verified quote was the Wikipedia article's paragraph on
    // mental-health uses, which backed only the side remark, not the main claims.
    const quote =
      "Some users have turned to LLM-based chatbots for mental health support, but researchers warn that hallucinations and the reinforcement of stigma can cause harm.";
    const answer =
      "Large language models are statistical models that predict the next token in a sequence. " +
      "They lack true reasoning and only imitate patterns from their training data. " +
      "They can also hallucinate, and when used for mental health support they may reinforce stigma.";
    assert.equal(marks(answer, [{ docId: "wikipedia:Large_language_model", quote }]), "--+");
  });

  it("marks invented details next to a real first sentence (Ada Lovelace live checks)", () => {
    const answer =
      "Ada Lovelace was an English mathematician and writer, known for her work on Charles Babbage's analytical engine. " +
      "She wrote Algorithm No. 62, the first published computer program. " +
      "In 2009 Ada Lovelace received the Charles Babbage Medal.";
    const title = () => "Ada Lovelace";
    // The article title names the subject, so "Ada Lovelace" alone does not back the medal.
    assert.equal(marks(answer, [{ docId: "wikipedia:Ada_Lovelace", quote: ADA_FIRST }], title), "+--");
  });

  it("marks a claim the quote does not make (ninth and tenth live checks)", () => {
    const quote =
      "Activity diagrams are graphical representations of workflows of stepwise activities and actions with support for choice, iteration and concurrency.";
    const answer =
      "Activity diagrams show workflows of stepwise activities and actions. An activity diagram models the state transitions of a process.";
    assert.equal(marks(answer, [{ docId: "wikipedia:Activity_diagram", quote }]), "+-");
  });

  it("lets the cited document's title name the subject (benchmark task r04)", () => {
    const quote = "- This release includes the fix for advisory LSA-2024-07.";
    const answer = "LumenDB version 3.2 contains the fix for LSA-2024-07.";
    assert.equal(marks(answer, [{ docId: "lumen-3-2-release", quote }]), "-");
    assert.equal(marks(answer, [{ docId: "lumen-3-2-release", quote }], () => "LumenDB 3.2 release notes"), "+");
  });

  it("does not judge short fragments, and counts only judged sentences", () => {
    const support = sentenceSupport(
      "Steps:\nOpen the Papyrus perspective in Eclipse.",
      [{ docId: "d", quote: "Open the Papyrus perspective", verified: true }],
    );
    assert.deepEqual(
      support.sentences.map((s) => s.backed),
      [undefined, true],
    );
    assert.equal(support.judged, 1);
    assert.equal(support.backed, 1);
  });

  it("lets only verified quotes back sentences", () => {
    const [checked] = checkEvidence([{ docId: "d", quote: "Lovelace patented the analytical engine in 1840" }], () => ADA);
    assert.equal(checked!.verified, false);
    assert.equal(marks("Lovelace patented the analytical engine in 1840.", [checked!]), "-");
  });
});

describe("answer status with sentence support", () => {
  const ok = { verified: true };
  const bad = { verified: false };

  it("says how much of the answer is backed when every quote is found", () => {
    const partial = describeStatus("verified", [ok], { judged: 5, backed: 3 });
    assert.equal(partial.label, "3 of 5 sentences backed by a quote");
    assert.equal(partial.tone, "unverified");
    assert.match(partial.detail, /marked ⚠/);
    const full = describeStatus("verified", [ok, ok], { judged: 2, backed: 2 });
    assert.equal(full.label, "Quotes found");
    assert.equal(full.tone, "verified");
    assert.match(full.detail, /every sentence shares most of its words with a quote/);
  });

  it("keeps the missing quotes first, and adds the sentence count", () => {
    const status = describeStatus("verified", [bad, ok], { judged: 4, backed: 2 });
    assert.equal(status.label, "Some quotes not found (1 of 2 found)");
    assert.match(status.detail, /2 of 4 sentences backed by a quote; the others are marked ⚠/);
  });

  it("says nothing about sentences when none could be judged", () => {
    assert.equal(describeStatus("verified", [ok], { judged: 0, backed: 0 }).label, "Quotes found");
    assert.match(describeStatus("verified", [ok], { judged: 0, backed: 0 }).detail, /Check that the quotes support the whole answer/);
  });
});
