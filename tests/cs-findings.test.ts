// The four changes the CS suite's first runs suggested (harness 0.73.0, eval/cs/README.md).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkEvidence } from "../src/agent/evidence.ts";
import { ResearchLibrary } from "../src/agent/research.ts";
import { chunkDocument, withoutRepeatedLead } from "../src/documents/chunk.ts";
import { createResearchTools, TABLE_NOTE_LINE } from "../src/tools/research.ts";
import { cutAtWord, DocumentIndex } from "../src/tools/search.ts";
import { csDocuments, csHoldoutTasks, csTasks } from "../eval/cs/tasks.ts";
import { scoreResearch } from "../eval/harness/scoring.ts";
import type { ResearchResult } from "../src/agent/research.ts";

const row = (i: number) => `| Method ${i} | ${(80 + i / 10).toFixed(2)} ± 0.${i % 10}${i % 7} | ${(1000 + i * 37).toFixed(2)} ± ${i}.05 | ${(90 - i / 7).toFixed(2)} |`;
const header = "| Method | Final Acc. (%) | Mean Up (KiB) | Down Red. (%) |";
const caption = "**Table 5** Static compression baselines on CIFAR-10. Values are mean ± SD across seeds 1–10.";
const table = [header, ...Array.from({ length: 40 }, (_, i) => row(i + 1))].join("\n");
const paper = { id: "paper", title: "A paper", text: `## Results\n\nThe baselines are compared in Table 5.\n\n${caption}\n\n${table}\n\n${"Other results are discussed at length here. ".repeat(45)}\n\nTable 5 shows that every coder keeps the quantized accuracy.` };

describe("a table longer than a part (harness 0.73.0)", () => {
  const parts = chunkDocument(paper);

  it("is split between rows, never inside one", () => {
    const pieces = parts.filter((p) => p.text.includes("| Method "));
    assert.ok(pieces.length >= 2, "the table spans parts");
    for (const piece of pieces) {
      for (const line of piece.text.split("\n").filter((l) => l.startsWith("|"))) assert.match(line, /^\|.*\|$/, `a whole row: ${line}`);
    }
    // Every row is in some part, once.
    for (let i = 1; i <= 40; i++) assert.equal(parts.filter((p) => p.text.includes(`${row(i)}\n`) || p.text.endsWith(row(i))).length, 1, `row ${i}`);
  });

  it("starts each later piece with the table's label, its caption's first sentence and its column names", () => {
    const later = parts.filter((p) => p.text.startsWith("**Table 5** (continued)"));
    assert.ok(later.length >= 1);
    for (const part of later) {
      assert.ok(part.text.startsWith(`**Table 5** (continued) Static compression baselines on CIFAR-10.\n${header}\n| Method `), part.text.slice(0, 200));
      assert.ok(part.text.length <= 1800);
    }
  });

  it("leaves the repeated lines out of what search indexes, and quotes of rows still verify", () => {
    const later = parts.find((p) => p.text.startsWith("**Table 5** (continued)"))!;
    assert.ok(withoutRepeatedLead(later.text).startsWith("| Method "));
    assert.doesNotMatch(withoutRepeatedLead(later.text), /continued|Final Acc/);
    const someRow = later.text.split("\n")[3]!;
    assert.equal(checkEvidence([{ docId: "paper", quote: someRow }], () => paper.text)[0]!.verified, true);
  });

  it("is kept whole when it fits, and other long paragraphs are split as before", () => {
    const short = { id: "s", title: "S", text: `${caption}\n\n${[header, row(1), row(2)].join("\n")}` };
    assert.deepEqual(chunkDocument(short).map((p) => p.text), [short.text]);
    const prose = { id: "p", title: "P", text: "A sentence that goes on. ".repeat(200) };
    assert.ok(chunkDocument(prose).every((p) => !p.text.includes("(continued)")));
  });
});

describe("where a cited table is (harness 0.73.0)", () => {
  const library = new ResearchLibrary([paper]);
  const index = library.index;
  const parts = index.partsOf("paper");
  const discussion = parts.find((id) => index.get(id)!.text.includes("Table 5 shows"))!;
  const holder = parts.find((id) => index.get(id)!.text.includes(caption))!;

  it("points from a part that cites a table to the part that holds its caption", () => {
    assert.notEqual(discussion, holder);
    assert.deepEqual(index.tablesCitedElsewhere(discussion), [{ table: "Table 5", partId: holder }]);
    assert.deepEqual(index.tablesCitedElsewhere(holder), [], "not from the part that holds it");
  });

  it("takes a paragraph that starts with a table's name for a citation, not a caption", () => {
    const lib = new ResearchLibrary([
      { id: "d", title: "D", text: `Table 2. Results by attack.\n\n| A | B |\n| 1 | 2 |\n| 3 | 4 |\n\n${"Filler text that is long enough. ".repeat(60)}\n\nTable 2 provides the results: removing voting costs 3.8 points.` },
    ]);
    const [first, ...rest] = lib.index.partsOf("d");
    assert.deepEqual(lib.index.tablesCitedElsewhere(rest.at(-1)!), [{ table: "Table 2", partId: first }]);
  });

  it("adds the pointer after a read part, and leaves it out of a shortened read", async () => {
    const question = "What final accuracy did method 40 reach?";
    const read = createResearchTools(index, undefined, question).find((t) => t.name === "read")!;
    const observation = (await read.execute!({ docId: discussion })) as string;
    assert.ok(observation.endsWith(`[Table 5 is in ${holder}.]`), observation.slice(-80));
    const short = read.shorten!({ docId: discussion }, observation);
    assert.ok(!short || !TABLE_NOTE_LINE.test(short));
  });
});

describe("a passage that uses only an abbreviation keeps a place in the results (harness 0.73.0)", () => {
  const docs = [
    { id: "abstract", title: "Paper, part 1", text: "A commitment-bound verification (CBV) mechanism is designed. Commitment-bound verification prevents tampering." },
    { id: "method", title: "Paper, part 2", text: "We design commitment-bound verification for the server. The verification is bound to a commitment." },
    { id: "security", title: "Paper, part 3", text: "Commitment-bound verification is secure: the commitment binds the verification." },
    { id: "ablation", title: "Paper, part 4", text: "CBV increases communication by 113.50% because it requires extra messages." },
  ];
  const index = new DocumentIndex(docs);
  const question = "How much does the commitment-bound verification mechanism increase communication overhead?";

  it("takes the last place when the passages that spell the term out fill the others", () => {
    const hits = index.search(question).map((h) => h.docId);
    assert.equal(hits.length, 3);
    assert.ok(hits.includes("ablation"), hits.join(", "));
    assert.equal(hits[0], index.search(question, 10)[0]!.docId, "the best result keeps its place");
  });

  it("changes nothing for a query that uses the abbreviation, or when such a passage is already shown", () => {
    assert.equal(index.search("CBV communication increase")[0]?.docId, "ablation");
    assert.deepEqual(index.search(question, 10).map((h) => h.docId).slice(0, 4).sort(), docs.map((d) => d.id).sort());
  });
});

describe("search snippets cut at a word (harness 0.73.0)", () => {
  const sentence =
    "The results demonstrate significant improvements in recall for low-frequency entities (29 percentage point gain, from 0.53 to 0.82, on the Factual subset) compared to both general-purpose RAG baselines and domain-specific methods.";

  it("ends a long sentence after its last whole word, marked [...], and leaves a short one alone", () => {
    const cut = cutAtWord(sentence, 220);
    assert.ok(cut.endsWith(" and […]"), cut);
    assert.ok(cut.length <= 226);
    assert.equal(cutAtWord("Short.", 220), "Short.");
  });

  it("gives a snippet the quote check accepts as it stands (cs21)", () => {
    const snippet = new DocumentIndex([{ id: "p", title: "P", text: sentence }]).search("low-frequency recall Factual subset")[0]!.snippet;
    assert.ok(snippet.endsWith("[…]"));
    assert.equal(checkEvidence([{ docId: "p", quote: snippet }], () => sentence)[0]!.verified, true);
    // A quote cut inside a word is still refused, as since 0.8.0.
    assert.equal(checkEvidence([{ docId: "p", quote: `${sentence.slice(0, 215)}…` }], () => sentence)[0]!.verified, false);
  });
});

describe("cs24 asks how a measure changed, not for its numbers (task defect, 0.73.0)", () => {
  const task = [...csTasks, ...csHoldoutTasks].find((t) => t.id === "cs24-bias-stereotype-500")!;
  const library = new ResearchLibrary(csDocuments.map((d) => ({ id: d.id, title: d.title, text: "" })));
  const result = (answer: string) =>
    ({ status: "verified", final: { found: true, answer, evidence: [{ docId: "llm-bias-rule-induction", quote: "q" }] }, evidence: [], citations: {}, sourceErrors: [] }) as unknown as ResearchResult;

  it("passes a right answer with or without the numbers, and fails a rise", () => {
    assert.equal(scoreResearch(task, result("In the 500-record evaluation, the framework consistently reduced Stereotypical Gender Assumption."), library).passed, true);
    assert.equal(scoreResearch(task, result("It decreased from 14.4% to 11.0%."), library).passed, true);
    assert.equal(scoreResearch(task, result("It rose to 14.4%."), library).passed, false);
  });
});
