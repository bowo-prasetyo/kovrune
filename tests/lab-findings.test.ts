// The two changes the lab suite's first runs asked for (harness 0.75.0): a pointer from a figure's legend
// to the prose that discusses it, and a check for a sentence of a source that answers the question and
// denies the answer. Both come from recorded failures: eval/lab/README.md, l04 and l03.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResearchLibrary } from "../src/agent/research.ts";
import { checkEvidence } from "../src/agent/evidence.ts";
import { contradictedSupport, labelledQuotesFound, sentenceSupport } from "../src/agent/support.ts";
import { createResearchTools, FIGURE_NOTE_LINE, figureNote } from "../src/tools/research.ts";

// A paper laid out as the converter writes one: results prose that cites a figure, then the legend.
const PROSE = "PPARαBATKO mice displayed, upon tamoxifen treatment, a strong inhibition of Pparα mRNA levels (Figure 1C) in BAT compared to Ctrl mice (up to 97% in female and 83% in male mice).";
const LEGEND = `*Figure 1: Generation of PPARαBATKO mice showing deletion of PPARα in brown adipose tissue. ${"Panels show the design of the experiment and the diet. ".repeat(12)}*`;
const paper = { id: "paper", title: "Deletion of PPARα in mouse brown adipocytes", text: `${"Introductory text that fills a part. ".repeat(40)}\n\n${PROSE}\n\n${LEGEND}` };

describe("where a figure is discussed (harness 0.75.0)", () => {
  const library = new ResearchLibrary([paper]);
  const index = library.index;
  const parts = index.partsOf("paper");
  const legend = parts.find((id) => index.get(id)!.text.includes("*Figure 1:"))!;
  const discussion = parts.find((id) => index.get(id)!.text.includes("up to 97%"))!;

  it("points from a figure's legend to the part that discusses it", () => {
    assert.notEqual(legend, discussion);
    assert.deepEqual(index.figuresDiscussedElsewhere(legend), [{ figure: "Figure 1", partId: discussion }]);
    // Not the other way round: the prose that cites a figure is where the values are.
    assert.deepEqual(index.figuresDiscussedElsewhere(discussion), []);
  });

  it("writes the pointer as a note, and leaves it out of a shortened read", async () => {
    const read = createResearchTools(index, undefined, "By how much was Pparα mRNA reduced?").find((t) => t.name === "read")!;
    const observation = (await read.execute!({ docId: legend })) as string;
    assert.ok(observation.endsWith(`[Figure 1 is discussed in ${discussion}.]`), observation.slice(-90));
    const short = read.shorten!({ docId: legend }, observation);
    assert.ok(!short || !FIGURE_NOTE_LINE.test(short), "a shortened read leaves the note out");
  });

  it("names nothing for a document with no figures, or a legend no other part cites", () => {
    assert.equal(figureNote([]), "");
    const alone = new ResearchLibrary([{ id: "d", title: "D", text: `${"Filler sentence here. ".repeat(80)}\n\n*Figure 9: A figure nothing cites.*` }]);
    for (const id of alone.index.partsOf("d")) assert.deepEqual(alone.index.figuresDiscussedElsewhere(id), []);
  });
});

describe("a source sentence that denies the answer (harness 0.75.0)", () => {
  const DENIAL = "Neither the heterozygous IL10 knockout nor a homozygous IL10 enhancer mutation had a major effect on pathogen clearance or inflammation in any of the challenge models.";
  const QUOTED = "We describe the lack of dosage compensation in heterozygous mutation and present evidence that the reduced expression of IL10 leads to increased pathogen clearance at the expense of increased inflammation.";
  const text = `${QUOTED}\n\n${"Other findings of the study follow here. ".repeat(10)}\n\n${DENIAL}`;
  const question = "In the IL10 chicken study, what effect did the heterozygous IL10 knockout have on pathogen clearance and inflammation?";
  const answer = "The heterozygous IL10 knockout led to increased pathogen clearance at the expense of increased inflammation.";
  const evidence = checkEvidence([{ docId: "il10", quote: QUOTED }], () => text);
  const support = (ans: string, q = question) =>
    contradictedSupport(sentenceSupport(ans, evidence, () => "IL10 in birds", q), [{ docId: "il10", text }], evidence, () => "IL10 in birds", q);

  it("takes the label from an answer the source denies, though every word check passed", () => {
    const backed = sentenceSupport(answer, evidence, () => "IL10 in birds", question);
    assert.equal(backed.backed, backed.judged, "the word checks pass: the answer's words are its quote's");
    assert.ok(labelledQuotesFound("verified", evidence, backed), "so it would be labelled before this check");
    const checked = support(answer);
    assert.equal(checked.contradicted?.passage, DENIAL);
    assert.equal(labelledQuotesFound("verified", evidence, checked), false);
  });

  it("leaves an answer that says the same as the denial alone", () => {
    // The right answer carries a negation itself, so the denial agrees with it.
    const right = "The heterozygous IL10 knockout did not have a major effect on pathogen clearance or inflammation.";
    assert.equal(support(right).contradicted, undefined);
  });

  it("does not accuse an answer of contradicting a passage it quotes", () => {
    const quotingDenial = checkEvidence([{ docId: "il10", quote: DENIAL }], () => text);
    const checked = contradictedSupport(
      sentenceSupport("The knockout increased pathogen clearance.", quotingDenial, () => "IL10 in birds", question),
      [{ docId: "il10", text }],
      quotingDenial,
      () => "IL10 in birds",
      question,
    );
    assert.equal(checked.contradicted, undefined);
  });

  it("needs a question long enough to be covered, and a denial that covers it", () => {
    assert.equal(support(answer, "What happened?").contradicted, undefined, "too few words asked");
    assert.equal(support(answer, "What dose of tamoxifen was injected into the mice each day?").contradicted, undefined, "the denial answers another question");
  });
});
