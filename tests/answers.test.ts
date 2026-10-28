import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";
import { answerToBibtex, answerToMarkdown, exportFileName, toSavedAnswer, type SavedAnswer } from "../src/app/research/answers.ts";
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

async function savedAnswer(): Promise<SavedAnswer> {
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
  ]);
  const result = await runResearch({ question: "What is the 2025 budget?", library, model, sources: [createOpenAlex(openAlexFetch)] });
  return toSavedAnswer({
    question: "What is the 2025 budget?",
    result,
    steps: ["Searching your documents for “budget 2025”: 1 document"],
    library,
    model: "Qwen3.5-4B on llama.cpp server",
    now: new Date("2026-10-25T12:00:00Z"),
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
    assert.match(markdown, /2\. ✗ annual-report\.pdf\n\n {3}> invented the telephone\n\n {3}Not found: quote not found in the document\./);
  });

  it("exports the cited papers as BibTeX, and nothing without them", async () => {
    const answer = await savedAnswer();
    const bibtex = answerToBibtex(answer)!;
    assert.match(bibtex, /^@article\{openalex_W2741809807,\n/);
    assert.match(bibtex, / {2}title = \{Attention Is All You Need\},\n/);
    assert.match(bibtex, / {2}author = \{Ashish Vaswani and Noam Shazeer\},\n/);
    assert.match(bibtex, / {2}year = \{2017\},\n {2}journal = \{arXiv\},\n {2}doi = \{10\.48550\/arxiv\.1706\.03762\},\n/);
    assert.equal(answerToBibtex({ ...answer, citations: {} }), undefined);
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
