import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { labelledQuotesFound, plainNumber, sentenceSupport, splitSentences } from "../src/agent/support.ts";
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

  it("marks a sentence whose number no quote has", () => {
    const quote = { docId: "d", quote: "The default page size is 4 KiB for every table." };
    assert.equal(marks("The default page size is 4 KiB for every table.", [quote]), "+");
    assert.equal(marks("The default page size is 8 KiB for every table.", [quote]), "-");
    const release = { docId: "d", quote: "Version 3.0 was released in March 2024 by the foundation." };
    assert.equal(marks("Version 3.0 was released in March 2021 by the foundation.", [release]), "-");
    // Thousands separators and a list item's own number do not count.
    assert.equal(marks("1. The context holds 4096 tokens by default.", [{ docId: "d", quote: "The context holds 4,096 tokens by default." }]), "+");
  });

  it("accepts a number from a cited title, the question, or a sum or difference of quoted numbers (benchmark tasks r04, r06, r15)", () => {
    const fix = { docId: "d", quote: "This release includes the fix for the advisory." };
    assert.equal(marks("LumenDB 3.2 includes the fix for the advisory.", [fix], () => "LumenDB 3.2 release notes"), "+");
    const rename = [{ docId: "d", quote: "createStore() has been renamed to defineStore().", verified: true }];
    const question = "In Quillstate 2.0, what was createStore() renamed to?";
    assert.equal(sentenceSupport("In Quillstate 2.0, createStore() was renamed to defineStore().", rename, undefined, question).backed, 1);
    assert.equal(sentenceSupport("In Quillstate 2.0, createStore() was renamed to defineStore().", rename).backed, 0);
    const writes = { docId: "d", quote: "Random writes: Cobble reached 180,000 operations per second; LumenDB reached 150,000 operations per second." };
    assert.equal(marks("Cobble had higher random-write throughput than LumenDB by 30,000 operations per second.", [writes]), "+");
    assert.equal(marks("Cobble had higher random-write throughput than LumenDB by 40,000 operations per second.", [writes]), "-");
  });

  it("marks a sentence that negates when no quote does", () => {
    const quote = { docId: "d", quote: "The Cobble store supports transactions across shards." };
    assert.equal(marks("The Cobble store does not support transactions across shards.", [quote]), "-");
    assert.equal(marks("The Cobble store never supports transactions across shards.", [quote]), "-");
    // A negation in the quote, even in another clause, lets the sentence negate or not (field task f02).
    const permission = {
      docId: "d",
      quote: "Local network access is a different permission, for other devices on your network, and isn't needed for a server on your own computer.",
    };
    assert.equal(marks("Local network access isn't needed for a server on your own computer.", [permission]), "+");
    assert.equal(marks("Local network access is a different permission for other devices on your network.", [permission]), "+");
  });

  it("does not judge a sentence made only of the cited documents' title words", () => {
    const quote = { docId: "d", quote: "Cobble is written in Go and developed by Harrow Labs." };
    assert.equal(marks("LumenDB embedded store release.", [quote], () => "LumenDB embedded store release notes"), ".");
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

  it("does not say Quotes found when the answer is too short to judge (benchmark tasks r04, u01)", () => {
    // "LumenDB 3.2" gave one of the two fixed versions, and "40" was another company's head count:
    // real quotes, and no sentence long enough to compare with them.
    for (const answer of ["LumenDB 3.2", "40"]) {
      const support = sentenceSupport(answer, [{ docId: "d", quote: "This release includes the fix for advisory LSA-2024-07.", verified: true }]);
      assert.equal(support.judged, 0);
      assert.equal(labelledQuotesFound("verified", [ok], support), false);
      const status = describeStatus("verified", [ok], support);
      assert.equal(status.label, "Quotes found, answer too short to check");
      assert.equal(status.tone, "unverified");
      assert.match(status.detail, /check that the quotes answer your question/);
    }
  });

  describe("a short answer found in a quote that covers the question", () => {
    const quote = (text: string, docId = "d") => ({ docId, quote: text, verified: true });
    const check = (answer: string, question: string, quotes: ReturnType<typeof quote>[], title?: string) =>
      sentenceSupport(answer, quotes, title ? () => title : undefined, question);

    it("is backed when the quote has the answer and most of the question's words (r05, p03, f29)", () => {
      const support = check("4 KiB", "What is the maximum key size in LumenDB 3.2?", [quote("In LumenDB 3.2 the maximum key size is 4 KiB.")]);
      assert.deepEqual(support, { sentences: [{ text: "4 KiB", backed: true }], judged: 1, backed: 1, answerInQuote: true });
      assert.equal(labelledQuotesFound("verified", [ok], support), true);
      const status = describeStatus("verified", [ok], support);
      assert.equal(status.label, "Quotes found");
      assert.match(status.detail, /the answer is in one of them, in a passage that shares most of the words of your question/);
      // Chinese, with the title naming the subject.
      const wall = check("1987年", "长城是哪一年被联合国教科文组织列为世界文化遗产的？", [quote("1987年，长城被联合国教科文组织列为世界文化遗产。")], "长城");
      assert.equal(wall.answerInQuote, true);
    });

    it("is not backed when the quote answers another question (u01, r22, f28)", () => {
      // The quote has "40", but it is another company's head count.
      const u01 = check("40", "How many employees does the Tessel Foundation have?", [quote("Harrow Labs is headquartered in Rotterdam and has 40 employees.")], "Harrow Labs press release");
      assert.equal(u01.judged, 0);
      // "Cobble" from a quote naming Harrow Labs covers exactly two thirds of "CEO, Harrow, Labs": not more.
      const r22 = check("Cobble", "Who is the CEO of Harrow Labs?", [quote("Harrow Labs today announced that Cobble, its embedded key-value store, has passed one million downloads.")]);
      assert.equal(r22.judged, 0);
      const f28 = check("1936年", "富士山が最後に噴火したのは何年ですか？", [quote("1936年（昭和11年）には富士箱根伊豆国立公園に指定されている。")], "富士山");
      assert.equal(f28.judged, 0);
    });

    it("is not backed when the answer is not word for word in a verified quote", () => {
      assert.equal(check("4 KB", "What is the maximum key size in LumenDB 3.2?", [quote("In LumenDB 3.2 the maximum key size is 4 KiB.")]).judged, 0);
      assert.equal(check("13", "How many levels does Brisk 2.0 support?", [quote("Brisk 2.0 supports levels 1 to 2013.")]).judged, 0, "whole words only");
      const unverified = { ...quote("In LumenDB 3.2 the maximum key size is 4 KiB."), verified: false };
      assert.equal(check("4 KiB", "What is the maximum key size in LumenDB 3.2?", [unverified]).judged, 0);
      assert.equal(check("4 KiB", "", [quote("In LumenDB 3.2 the maximum key size is 4 KiB.")]).judged, 0, "without the question, as before");
    });
  });

  it("keeps Quotes found for answers saved before sentence support", () => {
    assert.equal(describeStatus("verified", [ok]).label, "Quotes found");
    assert.match(describeStatus("verified", [ok]).detail, /Check that the quotes support the whole answer/);
  });

  it("keeps the missing quotes first for a short answer", () => {
    assert.equal(describeStatus("verified", [bad, ok], { judged: 0, backed: 0 }).label, "Some quotes not found (1 of 2 found)");
  });
});

describe("negations, months and units in a backed sentence (harness 0.36.0)", () => {
  const q = (quote: string, docId = "doc") => ({ docId, quote });
  const title = () => "LumenDB overview";

  it("backs a \"not\" only with a quote that makes the same claim", () => {
    // Before 0.36.0 any negating quote let every sentence say "not".
    assert.equal(marks("Cobble does not support transactions.", [q("Cobble supports transactions."), q("Wikipedia is not a reliable source.")]), "-");
    assert.equal(marks("Cobble does not support transactions.", [q("Cobble does not support transactions across shards.")]), "+");
    // The negating quote must name the sentence's numbers too: it is about version 2.x, not 3.0.
    const quotes = [q("LumenDB 3.0 was released in March 2024."), q("Version 2.x did not support encryption at rest.")];
    assert.equal(marks("LumenDB 3.0 does not support encryption at rest.", quotes, title), "-");
    assert.equal(marks("LumenDB 2.x did not support encryption at rest.", quotes, title), "+");
  });

  it("backs a month in a date only when the quotes, titles or question name it", () => {
    const quotes = [q("LumenDB 3.0 was released in March 2024.")];
    assert.equal(marks("LumenDB 3.0 was released in May 2024.", quotes, title), "-");
    assert.equal(marks("LumenDB 3.0 was released in March 2024.", quotes, title), "+");
    assert.equal(marks("LumenDB 3.0 was released in Mar. 2024.", quotes, title), "+", "short forms");
    // A month in digits counts: the advisory LSA-2024-07 was published in July 2024 (pdf task p04).
    assert.equal(
      marks("The advisory published in July 2024 was reported by Jonas Feld.", [q("The issue was reported by Jonas Feld.", "adv")], () => "Security advisory LSA-2024-07"),
      "+",
    );
    // "may" next to no number is a verb, not a month.
    assert.equal(marks("Users may export answers as Markdown files.", [q("Users can export answers as Markdown files.")]), "+");
  });

  it("gives a number only the unit the quotes give it", () => {
    const quotes = [q("The maximum key size is 4 KiB, and the cache holds 8 MB.")];
    assert.equal(marks("The cache holds 8 GB.", quotes), "-");
    assert.equal(marks("The cache holds 8 MB.", quotes), "+");
    assert.equal(marks("The maximum key size is 4 KB.", quotes), "+", "binary and decimal sizes are one unit");
    assert.equal(marks("The server context is 4096 tokens.", [q("Start the server context with -c 4096.")]), "+", "a bare number may take a unit");
    assert.equal(marks("The cure period lasts 30 days.", [q("The cure period lasts 30 days after notice.")]), "+");
    assert.equal(marks("The cure period lasts 30 weeks.", [q("The cure period lasts 30 days after notice.")]), "-");
  });
});

describe("elided quotes and decimal commas (harness 0.37.0)", () => {
  it("does not let a quote that leaves out many words back a sentence (audit N3)", () => {
    // "Cobble is released under ... the Apache-2.0 license" is in the source, piece by piece, but the
    // source says Cobble is released under another license, which converts to Apache-2.0 later.
    const source = "Cobble is released under the Business Source License 1.1, and each release converts to the Apache-2.0 license four years after its release date.";
    const answer = "Cobble is released under the Apache-2.0 license.";
    const evidence = checkEvidence([{ docId: "cobble", quote: "Cobble is released under ... the Apache-2.0 license" }], () => source);
    assert.equal(evidence[0]!.verified, true, "the quote is still found, and shown with the words it leaves out");
    const support = sentenceSupport(answer, evidence, () => "Cobble overview", "Which license is Cobble released under?");
    assert.deepEqual([support.backed, support.judged], [0, 1]);
    assert.equal(labelledQuotesFound("verified", evidence, support), false);
    assert.equal(describeStatus("verified", evidence, support).label, "0 of 1 sentences backed by a quote");
    // Leaving out an aside keeps the claim, so the quote still backs it.
    const aside = checkEvidence([{ docId: "cobble", quote: "Cobble, which ... never loses data" }], () => "Cobble, which is written in Go, never loses data.");
    assert.equal(sentenceSupport("Cobble never loses data.", aside).backed, 1);
  });

  it("does not count a line break written out as text as part of a word (field task f74)", () => {
    const quotes = [{ docId: "mpl", quote: "10.3. Modified Versions\\n\\nIf you create a new license, rename the license" }];
    assert.equal(marks("You must rename the license if you create a new license.", quotes), "+");
    // Read as text, "Cobble\\nsupports\\ntransactions" gives the words "nsupports" and "ntransactions".
    assert.equal(marks("Cobble supports transactions.", [{ docId: "c", quote: "Cobble\\nsupports\\ntransactions across shards" }]), "+");
  });

  it("reads a decimal comma as a decimal point, not a thousands separator (audit N5)", () => {
    assert.deepEqual(["1,5", "4,096", "21,196.18", "1,234,567", "3,14159", "2.5"].map(plainNumber), ["1.5", "4096", "21196.18", "1234567", "3.14159", "2.5"]);
    const quotes = [{ docId: "fr", quote: "La taille maximale du cache est de 1,5 Go par défaut." }];
    assert.equal(marks("La taille maximale du cache est de 15 Go.", quotes), "-");
    assert.equal(marks("La taille maximale du cache est de 1,5 Go.", quotes), "+");
    assert.equal(marks("La taille maximale du cache est de 1.5 Go.", quotes), "+", "1,5 and 1.5 are one number");
    assert.equal(marks("The context holds 4096 tokens.", [{ docId: "d", quote: "The context holds 4,096 tokens." }]), "+");
  });
});
