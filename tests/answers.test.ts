import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";
import type { DocumentWork } from "../src/documents/references.ts";
import { answerToBibtex, answerToMarkdown, exportFileName, sourceErrorNote, toSavedAnswer, type SavedAnswer } from "../src/app/research/answers.ts";
import { createOpenAlex } from "../src/sources/openalex.ts";
import type { FetchLike } from "../src/sources/types.ts";

class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 4096 };
  private readonly replies: string[];
  constructor(replies: string[]) {
    this.replies = replies;
  }
  supportsConstrainedDecoding() {
    return true;
  }
  async *generate(_request: GenerationRequest) {
    yield { text: this.replies.shift() ?? "{}", done: false };
    yield { text: "", done: true, usage: { promptTokens: 100, completionTokens: 20 } };
  }
  async dispose() {}
}

const WORK = {
  id: "https://openalex.org/W2741809807",
  display_name: "Attention Is All You Need",
  publication_year: 2017,
  doi: "https://doi.org/10.48550/arxiv.1706.03762",
  authorships: [{ author: { display_name: "Ashish Vaswani" } }, { author: { display_name: "Noam Shazeer" } }],
  abstract_inverted_index: { The: [0], dominant: [1], sequence: [2], models: [3, 6], are: [4], complex: [5] },
  primary_location: { source: { display_name: "arXiv" } },
};

const openAlexFetch: FetchLike = async (url) => ({
  ok: true,
  status: 200,
  json: async () => (/\/works\?/.test(url) ? { results: [WORK] } : WORK),
});

// A two-page "PDF": page 2 starts at offset 40.
const REPORT = {
  id: "report",
  title: "annual-report.pdf",
  text: "Total income for 2024 was EUR 412,000.\n\nThe budget for 2025 assumes income of EUR 450,000.",
  pageStarts: [0, 40],
};

async function savedAnswer(workOf?: (id: string) => DocumentWork | undefined): Promise<SavedAnswer> {
  const library = new ResearchLibrary([REPORT]);
  const model = new ScriptedModel([
    `{"tool":"search","args":{"query":"budget 2025"}}`,
    `{"tool":"read","args":{"docId":"report"}}`,
    `{"tool":"search_openalex","args":{"query":"sequence models"}}`,
    JSON.stringify({
      tool: "final_answer",
      args: {
        found: true,
        answer: "The budget for 2025 assumes income of EUR 450,000. Sequence models are complex.",
        evidence: [
          { docId: "report", quote: "The budget for 2025 assumes income of EUR 450,000." },
          { docId: "openalex:W2741809807", quote: "The dominant sequence models are complex models" },
        ],
      },
    }),
    // Asked to read what it quotes first (read before answering), the model answers again.
    JSON.stringify({
      tool: "final_answer",
      args: {
        found: true,
        answer: "The budget for 2025 assumes income of EUR 450,000. Sequence models are complex.",
        evidence: [
          { docId: "report", quote: "The budget for 2025 assumes income of EUR 450,000." },
          { docId: "openalex:W2741809807", quote: "The dominant sequence models are complex models" },
        ],
      },
    }),
    // The model's own check of the answer (agent/review.ts).
    `{"verdict":"yes"}`,
  ]);
  const result = await runResearch({ question: "What is the 2025 budget?", library, model, sources: [createOpenAlex(openAlexFetch)] });
  return toSavedAnswer({
    question: "What is the 2025 budget?",
    result,
    steps: ["Searching your documents for “budget 2025”: 1 document"],
    library,
    model: "Qwen3.5-4B on llama.cpp server",
    now: new Date("2026-10-25T12:00:00Z"),
    workOf,
  });
}

describe("saved answers", () => {
  it("keeps what the result view needs, and survives being stored", async () => {
    const answer = await savedAnswer();
    assert.equal(answer.status, "verified");
    assert.deepEqual(
      answer.evidence.map((e) => e.verified),
      [true, true],
    );
    // The user's document keeps its name and page even if it is later removed from the library.
    assert.equal(answer.titles.report, "annual-report.pdf");
    assert.deepEqual(answer.evidence[0]!.context!.pages, { first: 2, last: 2 });
    // The OpenAlex citation carries what a reference needs.
    assert.deepEqual(answer.citations["openalex:W2741809807"]!.work, {
      authors: ["Ashish Vaswani", "Noam Shazeer"],
      year: 2017,
      doi: "10.48550/arxiv.1706.03762",
      venue: "arXiv",
    });
    assert.equal(answer.askedAt, "2026-10-25T12:00:00.000Z");
    // IndexedDB stores a structured clone; nothing may be lost.
    assert.deepEqual(structuredClone(answer), answer);
  });

  it("exports as Markdown with the label, the answer, each quote's source and the steps", async () => {
    const markdown = answerToMarkdown(await savedAnswer());
    assert.match(markdown, /^# What is the 2025 budget\?\n/);
    assert.match(markdown, /with Qwen3\.5-4B on llama\.cpp server\./);
    assert.match(markdown, /\*\*Quotes found\.\*\* Every quote below is word for word/);
    assert.match(markdown, /1\. ✓ annual-report\.pdf, p\. 2\n\n {3}> The budget for 2025 assumes income of EUR 450,000\./);
    assert.match(markdown, /2\. ✓ \[Attention Is All You Need\]\(https:\/\/doi\.org\/10\.48550\/arxiv\.1706\.03762\) \(OpenAlex, retrieved \d{4}-\d\d-\d\d\)/);
    assert.match(markdown, /## Steps\n\n- Searching your documents for “budget 2025”: 1 document/);
    assert.match(markdown, /does not prove the answer is right/);
  });

  it("marks unbacked sentences and missing quotes in the export", async () => {
    const answer = await savedAnswer();
    const partial: SavedAnswer = {
      ...answer,
      answer: "The budget for 2025 assumes income of EUR 450,000. Lovelace invented the telephone in 1876.",
      evidence: [answer.evidence[0]!, { docId: "report", quote: "invented the telephone", verified: false, reason: "quote not found in the document" }],
      support: {
        sentences: [
          { text: "The budget for 2025 assumes income of EUR 450,000. ", backed: true },
          { text: "Lovelace invented the telephone in 1876.", backed: false },
        ],
        judged: 2,
        backed: 1,
      },
    };
    const markdown = answerToMarkdown(partial);
    assert.match(markdown, /\*\*Some quotes not found \(1 of 2 found\)\.\*\*/);
    assert.match(markdown, /EUR 450,000\. ⚠ Lovelace invented the telephone in 1876\./);
    assert.match(markdown, /2\. ✗ annual-report\.pdf\n\n {3}> invented the telephone\n\n {3}Problem: quote not found in the document\./);
  });

  it("says in the export which unquoted sentences are in a source the model read", async () => {
    const answer = await savedAnswer();
    const marked: SavedAnswer = {
      ...answer,
      answer: "The budget for 2025 assumes income of EUR 450,000. The board approved the plan in March. Lovelace invented the telephone.",
      support: {
        sentences: [
          { text: "The budget for 2025 assumes income of EUR 450,000. ", backed: true },
          { text: "The board approved the plan in March. ", backed: false, inSource: { docId: "report", title: "annual-report.pdf", passage: "The board approved the plan in March." } },
          { text: "Lovelace invented the telephone.", backed: false },
        ],
        judged: 3,
        backed: 1,
      },
    };
    const markdown = answerToMarkdown(marked);
    assert.match(markdown, /⚠ The board approved the plan in March\. \(in the source, not quoted\) ⚠ Lovelace invented the telephone\./);
    assert.match(markdown, /Those marked "in the source, not quoted" are nearly word for word in a source the model read/);
  });

  it("exports the cited papers as BibTeX, and nothing without them", async () => {
    const answer = await savedAnswer();
    const bibtex = answerToBibtex(answer)!;
    assert.match(bibtex, /^@article\{openalex_W2741809807,\n/);
    assert.match(bibtex, / {2}title = \{Attention Is All You Need\},\n/);
    assert.match(bibtex, / {2}author = \{Ashish Vaswani and Noam Shazeer\},\n/);
    assert.match(bibtex, / {2}year = \{2017\},\n {2}journal = \{arXiv\},\n {2}doi = \{10\.48550\/arxiv\.1706\.03762\},\n/);
    assert.equal(answerToBibtex({ ...answer, citations: {} }), undefined);
    // This OpenAlex work has no PubMed identifiers, so the entry has no such fields (harness 0.74.0).
    assert.doesNotMatch(bibtex, /pmid|pmcid/);
  });

  it("keys an INSPIRE record by its TeX key, as INSPIRE's BibTeX does (harness 0.92.0)", async () => {
    const answer = await savedAnswer();
    const work = { authors: ["ATLAS Collaboration"], year: 2012, doi: "10.1016/j.physletb.2012.08.020", venue: "Phys.Lett.B", texkey: "ATLAS:2012yve" };
    const citation = { title: "Observation of a new particle in the search for the Standard Model Higgs boson with the ATLAS detector at the LHC", url: "https://inspirehep.net/literature/1124337", retrievedAt: "2026-11-19T00:00:00Z", source: "INSPIRE-HEP", work };
    const inspire: SavedAnswer = { ...answer, evidence: [{ docId: "inspire:1124337", quote: "A search for the Standard Model Higgs boson", verified: true }], citations: { "inspire:1124337": citation } };
    const bibtex = answerToBibtex(inspire)!;
    assert.match(bibtex, /^@article\{ATLAS:2012yve,\n {2}title = \{Observation of a new particle/);
    assert.match(bibtex, / {2}author = \{ATLAS Collaboration\},\n {2}year = \{2012\},\n {2}journal = \{Phys\.Lett\.B\},\n {2}doi = \{10\.1016\/j\.physletb\.2012\.08\.020\},/);
    // Without a TeX key, by its record number.
    const plain = answerToBibtex({ ...inspire, citations: { "inspire:1124337": { ...citation, work: { ...work, texkey: undefined } } } })!;
    assert.match(plain, /^@article\{inspire_1124337,/);
  });

  it("exports PubMed identifiers with a paper that has them", async () => {
    const answer = await savedAnswer();
    const id = "openalex:W2741809807";
    const cited = answer.citations[id]!;
    const withIds: SavedAnswer = {
      ...answer,
      citations: { ...answer.citations, [id]: { ...cited, work: { ...cited.work!, pmid: "38012345", pmcid: "PMC10850983" } } },
    };
    const bibtex = answerToBibtex(withIds)!;
    assert.match(bibtex, / {2}doi = \{10\.48550\/arxiv\.1706\.03762\},\n {2}pmid = \{38012345\},\n {2}pmcid = \{PMC10850983\},\n/);
  });

  it("cites a library paper with the details its reference export gave", async () => {
    const work: DocumentWork = {
      title: "Annual Report of the Tessel Foundation",
      authors: ["Ana Lima", "Jon Berg"],
      year: 2025,
      venue: "Tessel Reports",
      doi: "10.1234/tessel.2025",
      from: "export",
      source: "library.bib",
    };
    const answer = await savedAnswer((id) => (id === "report" ? work : undefined));
    assert.deepEqual(answer.works, { report: work });
    const markdown = answerToMarkdown(answer);
    assert.match(markdown, /Lima and Berg \(2025\)\. Annual Report of the Tessel Foundation\. Tessel Reports\. https:\/\/doi\.org\/10\.1234\/tessel\.2025 \(annual-report\.pdf\), p\. 2/);
    const bibtex = answerToBibtex(answer)!;
    assert.match(bibtex, /@article\{doi_10_1234_tessel_2025,\n {2}title = \{Annual Report of the Tessel Foundation\},\n {2}author = \{Ana Lima and Jon Berg\},\n {2}year = \{2025\},\n {2}journal = \{Tessel Reports\},\n {2}doi = \{10\.1234\/tessel\.2025\},/);
    assert.match(bibtex, /note = \{From the user's library: annual-report\.pdf\}/);
    // The OpenAlex paper is still exported beside it.
    assert.match(bibtex, /@article\{openalex_W2741809807,/);
    // A document without details is cited by its name, as before, and is not in the BibTeX.
    const plain = await savedAnswer();
    assert.equal(plain.works, undefined);
    assert.doesNotMatch(answerToBibtex(plain)!, /annual-report/);
  });

  it("names export files after the question and the date", async () => {
    const answer = await savedAnswer();
    assert.equal(exportFileName(answer, "md"), "kovrune-what-is-the-2025-budget-2026-10-25.md");
    assert.equal(exportFileName({ ...answer, question: "???" }, "bib"), "kovrune-answer-2026-10-25.bib");
    // A long question is cut at a word boundary.
    assert.equal(
      exportFileName({ ...answer, question: "What was the income in 2024, and the budget for 2025?" }, "md"),
      "kovrune-what-was-the-income-in-2024-and-the-budget-for-2026-10-25.md",
    );
  });
});

describe("what a source failure is said to have cost the answer", () => {
  const UNREACHED = "OpenAlex could not be reached. Check your internet connection.";
  const quote = (docId: string, source: string, verified = true) => ({
    evidence: [{ docId, quote: "the thinking brain thinks and reasons", verified }],
    citations: { [docId]: { title: "The Teen Brain Thinks and Feels", url: "https://openalex.org/W1", retrievedAt: "2026-11-21T15:40:00.000Z", source } },
  });

  it("does not claim the answer leaves out a source its quotes come from", () => {
    // A preview user's answer quoted two OpenAlex works it had read before a later request failed, and
    // said "The answer is based on the other sources only" above evidence citing OpenAlex twice.
    assert.equal(sourceErrorNote(UNREACHED, quote("openalex:W1", "OpenAlex"), "The answer"), `${UNREACHED} Some of its results may be missing.`);
  });

  it("makes the claim when nothing verified comes from the source that failed", () => {
    const timedOut = "Europe PMC did not answer within 20 seconds. Try again later.";
    assert.equal(sourceErrorNote(timedOut, quote("openalex:W1", "OpenAlex"), "The answer"), `${timedOut} The answer is based on the other sources only.`);
    // A quote that is not in the document backs nothing, so the source gave the answer nothing.
    assert.equal(sourceErrorNote(UNREACHED, quote("openalex:W1", "OpenAlex", false), "The answer"), `${UNREACHED} The answer is based on the other sources only.`);
    assert.equal(sourceErrorNote(UNREACHED, { evidence: [], citations: {} }, "The answer"), `${UNREACHED} The answer is based on the other sources only.`);
  });

  it("takes a DataCite failure to be about the Zenodo copy it reads", () => {
    const failed = "DataCite could not be reached. Check your internet connection.";
    assert.equal(sourceErrorNote(failed, quote("datacite:10.5281/zenodo.1", "Zenodo"), "The answer"), `${failed} Some of its results may be missing.`);
  });

  it("says it of the section in a report", () => {
    assert.equal(sourceErrorNote(UNREACHED, { evidence: [], citations: {} }, "This section"), `${UNREACHED} This section is based on the other sources only.`);
  });

  it("says in the Markdown export which it was", async () => {
    const answer = await savedAnswer();
    const cited: SavedAnswer = { ...answer, sourceErrors: [UNREACHED] };
    assert.match(answerToMarkdown(cited), /> OpenAlex could not be reached\. Check your internet connection\. Some of its results may be missing\./);
    const other: SavedAnswer = { ...answer, sourceErrors: ["Wikipedia could not be reached. Check your internet connection."] };
    assert.match(answerToMarkdown(other), /> Wikipedia could not be reached\. Check your internet connection\. The answer is based on the other sources only\./);
  });
});
