import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { inSourceSupport, labelledQuotesFound, plainNumber, sentenceSupport, splitSentences } from "../src/agent/support.ts";
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
    assert.equal(describeStatus("verified", evidence, support).label, "0 of 1 sentence backed by a quote");
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

describe("clinical units, directions and significance (harness 0.59.0)", () => {
  const q = (quote: string, docId = "trial") => ({ docId, quote });
  const RESULT = q("All-cause mortality was lower in the intervention group than in the control group (hazard ratio 0.82; 95% CI 0.71 to 0.95).");

  it("gives a dose or a reading only the clinical unit the quotes give it", () => {
    assert.equal(marks("The dose was 500 mg daily.", [q("The dose was 500 µg daily.")]), "-");
    assert.equal(marks("The dose was 500 mcg daily.", [q("The dose was 500 µg daily.")]), "+", "µg and mcg are one unit");
    assert.equal(marks("Mean fasting glucose was 7.2 mg/dL.", [q("Mean fasting glucose was 7.2 mmol/L.")]), "-");
    assert.equal(marks("Mean fasting glucose was 7.2 mmol per litre.", [q("Mean fasting glucose was 7.2 mmol/L.")]), "+");
    assert.equal(marks("Systolic pressure fell to 120 mmHg.", [q("Systolic pressure fell to 120 mm Hg.")]), "+", "mm Hg and mmHg are one unit");
    assert.equal(marks("Patients received 2 g of the drug.", [q("Patients received 2 mg of the drug.")]), "-");
  });

  it("does not back a direction the quotes state only the opposite of", () => {
    assert.equal(marks("All-cause mortality was lower in the intervention group (hazard ratio 0.82).", [RESULT]), "+");
    assert.equal(marks("All-cause mortality was higher in the intervention group (hazard ratio 0.82).", [RESULT]), "-");
    assert.equal(marks("Fever was absent in 62% of patients.", [q("Fever was present in 62% of patients.")]), "-");
    assert.equal(marks("Statin therapy increased LDL cholesterol by 40 percent.", [q("Statin therapy reduced LDL cholesterol by 40 percent.")]), "-");
    assert.equal(marks("Weight gain averaged 3 kg over the trial.", [q("Weight loss averaged 3 kg over the trial.")]), "-");
  });

  it("leaves a direction to the other checks when the quotes state neither side", () => {
    // "Lower" paraphrases a hazard ratio below 1; the quotes say neither "lower" nor "higher".
    assert.equal(marks("Mortality was lower with the intervention (hazard ratio 0.82).", [q("Mortality with the intervention: hazard ratio 0.82 (95% CI 0.71 to 0.95).")]), "+");
    // A quote that says both sides backs either.
    const both = q("Costs were higher in the intervention group, while mortality was lower.");
    assert.equal(marks("Costs were higher in the intervention group.", [both]), "+");
  });

  it("does not let a sentence drop the quotes' \"no significant\"", () => {
    const none = q("There was no significant difference in the primary outcome between groups (P=0.41).");
    assert.equal(marks("There was a significant difference in the primary outcome between groups.", [none]), "-");
    assert.equal(marks("There was no significant difference in the primary outcome between groups.", [none]), "+");
    for (const quote of [
      "The difference in the primary outcome was not statistically significant.",
      "The difference in the primary outcome did not reach statistical significance.",
      "The difference in the primary outcome failed to reach significance.",
      "The difference in the primary outcome was non-significant.",
    ]) {
      assert.equal(marks("The difference in the primary outcome was statistically significant.", [q(quote)]), "-", quote);
    }
    // A negation in another clause does not reach the significance: this quote says something was significant.
    const mixed = q("There was no change in weight, but a significant fall in blood pressure.");
    assert.equal(marks("There was a significant fall in blood pressure.", [mixed]), "+");
    // Quotes that never speak of significance leave it to the other checks.
    assert.equal(marks("All-cause mortality was significantly lower in the intervention group (hazard ratio 0.82).", [RESULT]), "+");
  });

  it("reads a middle dot between digits as a decimal point (The Lancet's \"0·82\")", () => {
    const source = "Mortality was lower in the intervention group (hazard ratio 0·82, 95% CI 0·71–0·95; p=0·008).";
    const retyped = checkEvidence([{ docId: "lancet", quote: "Mortality was lower in the intervention group (hazard ratio 0.82, 95% CI 0.71-0.95" }], () => source);
    assert.equal(retyped[0]!.verified, true, "a quote typed with full stops is found");
    const asPrinted = checkEvidence([{ docId: "lancet", quote: "Mortality was lower in the intervention group (hazard ratio 0·82, 95% CI 0·71–0·95" }], () => source);
    assert.equal(sentenceSupport("Mortality was lower in the intervention group, with a hazard ratio of 0.82.", asPrinted).backed, 1);
    assert.equal(sentenceSupport("Mortality was lower in the intervention group, with a hazard ratio of 82.", asPrinted).backed, 0);
    // Between letters, or standing alone as a list marker, it is not a decimal point.
    assert.equal(checkEvidence([{ docId: "c", quote: "la col·lecció del museu és gran" }], () => "La col·lecció del museu és gran.")[0]!.verified, true);
  });
});

describe("counts of people recruited, not planned (harness 0.62.0)", () => {
  const q = (quote: string, docId = "vessel") => ({ docId, quote });
  // Both Qwen3.5 models' answers to the clinical suite's c09 in the 0.60.0 runs, with their quotes. The trial recruited 18.
  const CALCULATED = q("Based on 24-h ambulatory SBP as the primary outcome, a desired sample size of 25 participants was calculated");
  const UNABLE = q("As we were unable to recruit the desired sample size of 25 participants (28 to account for participant drop-out) due to the COVID-19 pandemic");
  const QUESTION = "How many participants were recruited to the VESSEL trial of cruciferous vegetables and blood pressure?";

  it("does not back a count of people recruited with a quote that gives the number as a target", () => {
    assert.equal(marks("25 participants were recruited to the VESSEL trial.", [CALCULATED]), "-");
    assert.equal(marks("25 participants were enrolled.", [UNABLE]), "-");
    assert.equal(marks("A total of 25 participants were randomised.", [q("The target sample size was 25 participants.")]), "-");
  });

  it("does not let a bare count answer a question about recruitment from a target", () => {
    const evidence = [{ ...UNABLE, verified: true }];
    // The paper's own title, which supplies the question's words, as in the run.
    const title = "Cruciferous vegetables lower blood pressure in adults with mildly elevated blood pressure in a randomized, controlled, crossover trial: the VESSEL study (BMC Medicine 2024, PMC11367748)";
    const support = sentenceSupport("25", evidence, () => title, QUESTION);
    assert.deepEqual([support.judged, support.backed, support.answerInQuote], [0, 0, undefined], "too short to check, not backed");
    assert.equal(labelledQuotesFound("verified", evidence, support), false);
  });

  it("still backs a count the quotes give, a number after \"the planned\", and a sentence about the plan", () => {
    assert.equal(marks("18 participants were enrolled in the trial.", [q("In all, 18 of the planned 25 participants were enrolled in the trial.")]), "+");
    assert.equal(marks("904 women were enrolled and randomly assigned.", [q("From Nov 11, 2019, to Aug 3, 2021, 904 women were enrolled and randomly assigned")]), "+");
    assert.equal(marks("A total of 200 patients were randomised.", [q("We aimed to randomise 200 patients; 200 patients were randomised by March.")]), "+");
    assert.equal(marks("The planned sample size was 25 participants.", [CALCULATED]), "+", "a sentence about the plan is not a count");
    // Any quote that gives the number as a count backs it, even next to one that gives it as a target.
    assert.equal(marks("25 participants were recruited.", [CALCULATED, q("In the end, 25 participants were recruited.")]), "+");
  });
});

describe("sentences no quote backs, found in a source the model read", () => {
  // A user's answer on how paracetamol relieves pain, from the abstract of "Mechanism of action of paracetamol" (2005).
  const ABSTRACT =
    "Paracetamol (acetaminophen) is generally considered to be a weak inhibitor of the synthesis of prostaglandins (PGs). Paracetamol is a weak inhibitor of PG synthesis of COX-1 and COX-2 in broken cell systems, but, by contrast, therapeutic concentrations of paracetamol inhibit PG synthesis in intact cells in vitro when the levels of the substrate arachidonic acid are low (less than about 5 mumol/L). Thus, the apparent selectivity of paracetamol may be due to inhibition of COX-2-dependent pathways that are proceeding at low rates.";
  const QUOTE = "Paracetamol (acetaminophen) is generally considered to be a weak inhibitor of the synthesis of prostaglandins (PGs).";
  const ANSWER =
    "Paracetamol is generally considered a weak inhibitor of the synthesis of prostaglandins. It is considered a weak inhibitor of prostaglandin (PG) synthesis, particularly in intact cells when arachidonic acid levels are low. The apparent selectivity of paracetamol may be due to inhibition of COX-2-dependent pathways that proceed at low rates.";
  const titleFor = () => "Mechanism of action of paracetamol.";
  const question = "How does paracetamol relieve pain?";
  const evidence = checkEvidence([{ docId: "pmc", quote: QUOTE }], () => ABSTRACT);
  const support = sentenceSupport(ANSWER, evidence, titleFor, question);
  const found = inSourceSupport(support, [{ docId: "pmc", text: ABSTRACT }], titleFor, question);

  it("finds a sentence the source gives nearly word for word, and not one that says the reverse", () => {
    assert.deepEqual(support.sentences.map((s) => s.backed), [true, false, false]);
    assert.equal(found.sentences[1]!.inSource, undefined, "weak \"particularly\" where the paper says it inhibits: 7 of 13 words is not enough");
    assert.deepEqual(found.sentences[2]!.inSource, {
      docId: "pmc",
      title: "Mechanism of action of paracetamol.",
      passage: "Thus, the apparent selectivity of paracetamol may be due to inhibition of COX-2-dependent pathways that are proceeding at low rates.",
    });
  });

  it("changes no count or label: a sentence is backed by what was quoted, not by what was read", () => {
    assert.equal(found.judged, support.judged);
    assert.equal(found.backed, support.backed);
    assert.equal(found.sentences[2]!.backed, false);
    assert.equal(describeStatus("verified", evidence, found).label, describeStatus("verified", evidence, support).label);
    assert.match(describeStatus("verified", evidence, found).detail, /Those marked "in the source, not quoted" are nearly word for word in a source the model read/);
    assert.match(describeStatus("verified", evidence, support).detail, /They may come from the model's memory/);
  });

  it("needs a short sentence whole, and a claim, not a bare phrase", () => {
    // Lacking only "Primary", which makes it wrong: the licence's notice says something else.
    const notice = 'This Source Code Form is "Incompatible With Secondary Licenses", as defined by the Mozilla Public License, v. 2.0.';
    const mpl = sentenceSupport("The MPL-2.0 Secondary License is defined as a license that is incompatible with the MPL-2.0 Primary License.", [], () => "mpl-2.0.txt");
    assert.equal(inSourceSupport(mpl, [{ docId: "mpl", text: notice }], () => "mpl-2.0.txt").sentences[0]!.inSource, undefined);
    const guide = sentenceSupport("Local model server", [], () => "Guide");
    assert.equal(inSourceSupport({ ...guide, sentences: [{ text: "Local model server", backed: false }] }, [{ docId: "g", text: "Set up a local model server." }]).sentences[0]!.inSource, undefined);
  });
});

describe("engineering units, signs, powers of ten and changes (harness 0.67.0)", () => {
  const q = (quote: string, docId = "paper") => ({ docId, quote });

  it("gives a value only the engineering unit and prefix the quotes give it", () => {
    const pairs: Array<[quote: string, wrong: string, right: string]> = [
      ["The yield strength of the alloy is 276 MPa at room temperature.", "The yield strength of the alloy is 276 GPa.", "The yield strength of the alloy is 276 megapascals."],
      ["The insulation is rated for 600 V across the terminals.", "The insulation is rated for 600 kV.", "The insulation is rated for 600 volts."],
      ["The oscillator runs at a clock frequency of 2.4 MHz under load.", "The oscillator runs at a clock frequency of 2.4 GHz.", "The oscillator runs at a clock frequency of 2.4 MHz."],
      ["Standby power of the sensor node was 15 mW on average.", "Standby power of the sensor node was 15 W.", "Standby power of the sensor node was 15 milliwatts."],
      ["The bolted joint failed at an axial load of 45 kN.", "The bolted joint failed at an axial load of 45 N.", "The bolted joint failed at an axial load of 45 kilonewtons."],
      ["A decoupling capacitor of 100 nF sits next to each supply pin.", "A decoupling capacitor of 100 µF sits next to each supply pin.", "A decoupling capacitor of 100 nF sits next to each supply pin."],
      ["The amplifier gives an output power of 20 dBm at compression.", "The amplifier gives an output power of 20 dB at compression.", "The amplifier gives an output power of 20 dBm."],
      ["The coolant outlet temperature stabilised at 350 °C.", "The coolant outlet temperature stabilised at 350 K.", "The coolant outlet temperature stabilised at 350 °C."],
    ];
    for (const [quote, wrong, right] of pairs) {
      assert.equal(marks(wrong, [q(quote)]), "-", wrong);
      assert.equal(marks(right, [q(quote)]), "+", right);
    }
    // The prefix is in the symbol's case: a milliwatt is not a megawatt, nor a viscosity in mPa·s a stress in MPa.
    assert.equal(marks("The plant exports 15 MW at night.", [q("The plant exports 15 mW at night.")]), "-");
    assert.equal(marks("The oil viscosity is 32 MPa at 40 °C.", [q("The oil viscosity is 32 mPa·s at 40 °C.")]), "-");
  });

  it("reads a prefix the PDF set apart from its symbol as one unit", () => {
    // pdf.js gives "40 m Ω" when the "Ω" comes from a symbol font.
    const quote = q("R DS(on) = 40 m Ω at T j = 25 ° C");
    assert.equal(marks("R DS(on) is 40 mΩ at T j = 25 °C.", [quote]), "+");
    assert.equal(marks("R DS(on) is 40 kΩ at T j = 25 °C.", [quote]), "-");
  });

  it("keeps a number's sign, unless the sentence gives the size of a fall", () => {
    const range = q("The device operates over an ambient temperature range from −40 °C to 85 °C without derating.");
    assert.equal(marks("The device operates over an ambient temperature range from 40 °C to 85 °C.", [range]), "-");
    assert.equal(marks("The device operates over an ambient temperature range from -40 °C to 85 °C.", [range]), "+");
    assert.equal(marks("The device operates from minus 40 °C to 85 °C ambient temperature.", [range]), "+");
    // pdf.js sets a minus sign apart from its number.
    assert.equal(marks("The converter was tested over an ambient range of 25 °C to 55 °C.", [q("tested over an ambient range of − 25 °C to 55 °C")]), "-");
    assert.equal(marks("Efficiency fell by 3.2% at light load.", [q("Efficiency showed a change of −3.2% at light load.")]), "+");
    // A hyphen after a letter or a digit is not a sign.
    assert.equal(marks("The unit passed IEC 61000-4-2 contact discharge at 8 kV.", [q("The unit passed IEC 61000-4-2 contact discharge at 8 kV.")]), "+");
    assert.equal(marks("The rated storage range is 20 to 30 °C.", [q("The rated range is 20–30 °C for storage.")]), "+");
  });

  it("reads powers of ten as one number, with the exponent's sign", () => {
    const strain = q("The measured thermal expansion coefficient was 1.2 × 10^-3 per kelvin.");
    assert.equal(marks("The measured thermal expansion coefficient was 1.2 × 10^3 per kelvin.", [strain]), "-");
    assert.equal(marks("The measured thermal expansion coefficient was 0.0012 per kelvin.", [strain]), "+");
    assert.equal(marks("The measured thermal expansion coefficient was 1.2×10⁻³ per kelvin.", [strain]), "+");
    assert.equal(marks("The leakage current remained below 1e6 A during the test.", [q("The leakage current remained below 1e-6 A during the test.")]), "-");
    // A superscript exponent is not run into the digits before it: "10⁶" is not 106.
    assert.equal(marks("The friction factor error was 10⁶ in the model.", [q("The friction factor error was 10⁻⁶ in the model.")]), "-");
    assert.equal(marks("The friction factor error was 10^-6 in the model.", [q("The friction factor error was 10⁻⁶ in the model.")]), "+");
    // pdf.js sets a superscript exponent apart: "2.5 × 10 − 6 A".
    assert.equal(marks("Leakage stayed below 2.5 × 10^-6 A in the test.", [q("Leakage stayed below 2.5 × 10 − 6 A in the test.")]), "+");
    // "×" and a number without "^" or a sign is a size, not a power.
    assert.equal(marks("The plate measures 4 × 10 mm in the drawing.", [q("The plate measures 4 × 10 mm in the drawing.")]), "+");
  });

  it("does not back an engineering opposite the quotes state only the other side of", () => {
    assert.equal(marks("The minimum allowable deflection of the beam is L/360.", [q("The maximum allowable deflection of the beam is L/360 under live load.")]), "-");
    assert.equal(marks("The member carries a compressive force of 120 kN.", [q("The member carries a tensile force of 120 kN.")]), "-");
    assert.equal(marks("The outlet temperature of the exchanger was 35 °C.", [q("The inlet temperature of the exchanger was 35 °C.")]), "-");
    assert.equal(marks("The specimen failed the 500-cycle thermal shock test.", [q("The specimen passed the 500-cycle thermal shock test.")]), "-");
    assert.equal(marks("The measured efficiency is below the 92% target.", [q("The measured efficiency exceeds the 92% target.")]), "-");
    assert.equal(marks("The measured efficiency exceeds the 92% target.", [q("The measured efficiency exceeds the 92% target set by the standard.")]), "+");
  });

  it("does not back a change from one number to another stated the other way round", () => {
    const change = q("At 20% load, efficiency improved from 96.4% to 97.1% with the adaptive controller.");
    assert.equal(marks("At 20% load, efficiency improved from 97.1% to 96.4%.", [change]), "-");
    assert.equal(marks("At 20% load, efficiency improved from 96.4% to 97.1%.", [change]), "+");
    assert.equal(marks("The dead time was reduced from 150 ns to 90 ns.", [q("Dead time was reduced from 150 ns to 90 ns.")]), "+");
  });
});

describe("laboratory units, opposites and names (harness 0.70.0)", () => {
  const q = (quote: string, docId = "paper") => ({ docId, quote });

  it("gives a value only the laboratory unit and prefix the quotes give it", () => {
    const pairs: Array<[quote: string, wrong: string, right: string]> = [
      ["Cells were treated with 10 µM rapamycin for 24 h.", "Cells were treated with 10 mM rapamycin for 24 h.", "Cells were treated with 10 micromolar rapamycin for 24 h."],
      ["The IC50 of the compound was 45 nM in HeLa cells.", "The IC50 of the compound was 45 µM in HeLa cells.", "The IC50 of the compound was 45 nM in HeLa cells."],
      ["Lysates were made in buffer with 150 mM NaCl.", "Lysates were made in buffer with 150 M NaCl.", "Lysates were made in buffer with 150 mM NaCl."],
      ["We added 5 µL of lysate to each well.", "We added 5 mL of lysate to each well.", "We added 5 uL of lysate to each well."],
      ["The band migrated at 55 kDa on the immunoblot.", "The band migrated at 55 Da on the immunoblot.", "The band migrated at 55 kD on the immunoblot."],
      ["The deletion spans 300 bp of the promoter.", "The deletion spans 300 kb of the promoter.", "The deletion spans 300 base pairs of the promoter."],
      ["Samples were centrifuged at 12,000 × g for 10 min.", "Samples were centrifuged at 12,000 rpm for 10 min.", "Samples were centrifuged at 12,000 x g for 10 min."],
      ["Mice were infected with 10^5 PFU of influenza virus.", "Mice were infected with 10^5 CFU of influenza virus.", "Mice were infected with 10⁵ PFU of influenza virus."],
    ];
    for (const [quote, wrong, right] of pairs) {
      assert.equal(marks(wrong, [q(quote)]), "-", wrong);
      assert.equal(marks(right, [q(quote)]), "+", right);
    }
    // "mM" was read as millimetres, and "μM" as no unit, so "10 mM" was backed by "10 μM".
    assert.equal(marks("The medium contained 2 mm glutamine.", [q("The medium contained 2 mM glutamine.")]), "-");
    // A kilobase is still a kilobyte's scale: sizes in bytes keep their spellings.
    assert.equal(marks("The page size is 4 KB on disk.", [q("The page size is 4 KiB on disk.")]), "+");
  });

  it("does not back a laboratory opposite the quotes state only the other side of", () => {
    const pairs: Array<[quote: string, wrong: string]> = [
      ["TP53 expression was upregulated in tumour samples.", "TP53 expression was downregulated in tumour samples."],
      ["AMPK activates ULK1 by phosphorylation at Ser555.", "AMPK inhibits ULK1 by phosphorylation at Ser555."],
      ["Knockdown of YAP1 reduced proliferation of the cells.", "Overexpression of YAP1 reduced proliferation of the cells."],
      ["H3K27me3 was enriched at the HOXA locus.", "H3K27me3 was depleted at the HOXA locus."],
      ["The compound acts as an agonist of the receptor.", "The compound acts as an antagonist of the receptor."],
      ["The mutant strain was resistant to ampicillin.", "The mutant strain was susceptible to ampicillin."],
      ["Wild-type mice developed tumours by 12 weeks.", "Mutant mice developed tumours by 12 weeks."],
      ["The effect was found in male mice only.", "The effect was found in female mice only."],
      ["The effect on migration was seen in vitro only.", "The effect on migration was seen in vivo only."],
    ];
    for (const [quote, wrong] of pairs) {
      assert.equal(marks(wrong, [q(quote)]), "-", wrong);
      assert.equal(marks(quote, [q(quote)]), "+", quote);
    }
    // A sentence that states both sides of a pair says which is which in its word order, which is left to the other checks.
    assert.equal(marks("Compound C inhibited the activation of AMPK in the cells.", [q("Compound C inhibited AMPK in the cells.")]), "+");
  });

  it("tells apart names that differ in a Greek letter, a marker's sign or a genotype", () => {
    const pairs: Array<[quote: string, wrong: string, right: string]> = [
      ["TNF-α levels rose after treatment with LPS.", "TNF-β levels rose after treatment with LPS.", "TNF-alpha levels rose after treatment with LPS."],
      ["Estradiol signals mainly through ERα in the uterus.", "Estradiol signals mainly through ERβ in the uterus.", "Estradiol signals mainly through ERα in the uterus."],
      ["IL-1β secretion required caspase-1 in macrophages.", "IL-1α secretion required caspase-1 in macrophages.", "IL-1beta secretion required caspase-1 in macrophages."],
      ["CD45+ cells expanded after injury in the liver.", "CD45− cells expanded after injury in the liver.", "CD45-positive cells expanded after injury in the liver."],
      ["CD8- T cells did not proliferate after stimulation.", "CD8+ T cells did not proliferate after stimulation.", "CD8 negative T cells did not proliferate after stimulation."],
      ["The phenotype appeared in Tlr4−/− mice at 8 weeks.", "The phenotype appeared in Tlr4+/+ mice at 8 weeks.", "The phenotype appeared in Tlr4-/- mice at 8 weeks."],
      ["S. aureus was isolated from 12 wounds.", "S. epidermidis was isolated from 12 wounds.", "S. aureus was isolated from 12 wounds."],
    ];
    for (const [quote, wrong, right] of pairs) {
      assert.equal(marks(wrong, [q(quote)]), "-", wrong);
      assert.equal(marks(right, [q(quote)]), "+", right);
    }
    // A name inside a longer one, written apart, or named in the title or the question.
    assert.equal(marks("TNF-α signalling activates NF-κB in these cells.", [q("TNF-α-induced signalling activates NF-κB in these cells.")]), "+");
    assert.equal(marks("TNF-α levels rose after LPS treatment.", [q("TNF α levels rose after LPS treatment.")]), "+");
    assert.equal(marks("Staphylococcus aureus was isolated from 12 wounds.", [q("S. aureus was isolated from 12 wounds.")]), "+");
    assert.equal(marks("S. aureus was isolated from 12 wounds.", [q("Staphylococcus aureus was isolated from 12 wounds.")]), "+");
    assert.equal(marks("PPARγ agonists lowered glucose in the trial.", [q("These agonists lowered glucose in the trial.")], () => "PPARγ agonists in diabetes"), "+");
    // A hyphen that ends a word is not a marker's sign.
    assert.equal(marks("Weight was measured pre- and post-treatment in all mice.", [q("Weight was measured before and after treatment in all mice.")]), "+");
  });
});

describe("each claim of a sentence (harness 0.68.0)", () => {
  // A user's answer, paracetamol against ibuprofen, and its quote from Wikipedia.
  const SOURCE =
    "Compared to Ibuprofen—which can have adverse effects that include diarrhea, vomiting, and abdominal pain—paracetamol is well tolerated with fewer side effects. Ollama is experimental; llama.cpp server is the supported local server.";
  const evidence = checkEvidence(
    [
      { docId: "p", quote: "Compared to Ibuprofen—which can have adverse effects that include diarrhea, vomiting, and abdominal pain—paracetamol is well tolerated with fewer side effects." },
      { docId: "p", quote: "Ollama is experimental; llama.cpp server is the supported local server." },
    ],
    () => SOURCE,
  );
  const backed = (text: string) => sentenceSupport(text, evidence, () => "Paracetamol").sentences[0]!.backed;

  it("marks a claim joined to a backed one with \"and\" before a verb", () => {
    assert.equal(
      backed("Ibuprofen can cause adverse effects including diarrhea, vomiting, abdominal pain, and is associated with a higher risk of gastrointestinal bleeding and hypertension compared to paracetamol."),
      false,
    );
    assert.equal(backed("Ibuprofen can cause adverse effects including diarrhea, vomiting, abdominal pain."), true);
  });

  it("does not split a list, and passes claims each backed", () => {
    assert.equal(backed("Ibuprofen can have adverse effects that include diarrhea, vomiting, and abdominal pain."), true, "a list joined by and");
    assert.equal(backed("The llama.cpp server is the supported local server, while Ollama is experimental."), true);
    assert.equal(backed("The llama.cpp server is the supported local server, while Ollama is marked as experimental in the design documentation."), false);
  });
});
