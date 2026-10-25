import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { answerStatus, checkEvidence, closestPassage, normalizeForMatch } from "../src/agent/evidence.ts";
import { ResearchLibrary } from "../src/agent/research.ts";
import { chunkDocument, parentId } from "../src/documents/chunk.ts";
import { detectKind, extractText, htmlToText, type PdfJsLike } from "../src/documents/extract.ts";
import { corpus } from "../eval/tasks/corpus.ts";

describe("evidence check", () => {
  const texts: Record<string, string> = {
    doc: "LumenDB 3.0, released in March 2024, is licensed under the “Mozilla Public License 2.0”.\nIt is maintained by\nthe Tessel Foundation.",
  };
  const resolve = (id: string) => texts[id];

  it("verifies quotes regardless of case, whitespace, curly quotes and edge punctuation", () => {
    const [checked] = checkEvidence([{ docId: "doc", quote: '"maintained by the TESSEL foundation."' }], resolve);
    assert.equal(checked!.verified, true);
    const [curly] = checkEvidence([{ docId: "doc", quote: 'licensed under the "Mozilla Public License 2.0"' }], resolve);
    assert.equal(curly!.verified, true);
  });

  it("rejects missing documents, invented wording and quotes under three words", () => {
    const checked = checkEvidence(
      [
        { docId: "nope", quote: "maintained by the Tessel Foundation" },
        { docId: "doc", quote: "maintained by the Apache Foundation" },
        { docId: "doc", quote: "Tessel Foundation" },
      ],
      resolve,
    );
    assert.deepEqual(
      checked.map((c) => c.reason),
      ["the model cited a document ID it never found", "quote not found in the document", "quote shorter than 3 words"],
    );
  });

  it("gives each answer a status", () => {
    const verified = checkEvidence([{ docId: "doc", quote: "maintained by the Tessel Foundation" }], resolve);
    const unverified = checkEvidence([{ docId: "doc", quote: "made up words entirely" }], resolve);
    assert.equal(answerStatus(true, verified), "verified");
    assert.equal(answerStatus(true, unverified), "unverified");
    assert.equal(answerStatus(true, []), "unverified");
    assert.equal(answerStatus(false, []), "not-found");
  });

  it("normalizes dashes and non-breaking spaces", () => {
    assert.equal(normalizeForMatch("3.0–3.1 versions"), "3.0-3.1 versions");
  });
});

describe("chunking", () => {
  it("leaves short documents unchanged, so the M0 corpus keeps its IDs", () => {
    for (const doc of corpus) assert.deepEqual(chunkDocument(doc), [{ ...doc, text: doc.text.trim() }], doc.id);
  });

  it("splits long documents at paragraph boundaries with part IDs and titles", () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `Paragraph ${i + 1}. ${"word ".repeat(80).trim()}.`);
    const chunks = chunkDocument({ id: "report", title: "Report", text: paragraphs.join("\n\n") }, 1000);
    assert.ok(chunks.length > 1);
    assert.deepEqual(chunks.map((c) => c.id), chunks.map((_, i) => `report#${i + 1}`));
    assert.equal(chunks[0]!.title, `Report (part 1 of ${chunks.length})`);
    assert.ok(chunks.every((c) => c.text.length <= 1000));
    assert.equal(chunks.map((c) => c.text).join("\n\n"), paragraphs.join("\n\n"));
  });

  it("breaks a single long paragraph into sentences and words", () => {
    const text = `${"Short sentence here. ".repeat(60)}${"x".repeat(10)} ${"longword ".repeat(200)}`;
    const chunks = chunkDocument({ id: "d", title: "D", text }, 500);
    assert.ok(chunks.every((c) => c.text.length <= 500), String(chunks.map((c) => c.text.length)));
    assert.equal(chunks.map((c) => c.text).join(" ").replace(/\s+/g, " "), text.trim().replace(/\s+/g, " "));
  });

  it("maps chunk IDs back to their document", () => {
    assert.equal(parentId("report#3"), "report");
    assert.equal(parentId("lumen-overview"), "lumen-overview");
    assert.equal(parentId("issue#nine"), "issue#nine");
  });

  it("verifies quotes against the whole document when the model cites a chunk", () => {
    const text = `${"Intro paragraph. ".repeat(150)}\n\nThe budget for 2025 assumes income of EUR 450,000.`;
    const library = new ResearchLibrary([{ id: "report", title: "Report", text }]);
    const parts = library.index.partsOf("report");
    assert.ok(parts.length > 1);
    assert.equal(library.textFor(parts[0]!), text);
    assert.equal(library.documentFor(parts.at(-1)!)!.id, "report");
  });
});

describe("text extraction", () => {
  it("detects supported file types", () => {
    assert.equal(detectKind("paper.PDF"), "pdf");
    assert.equal(detectKind("page.htm"), "html");
    assert.equal(detectKind("notes.md"), "markdown");
    assert.equal(detectKind("notes.txt"), "text");
    assert.equal(detectKind("data", "text/plain"), "text");
    assert.equal(detectKind("sheet.xlsx"), undefined);
  });

  it("turns HTML into readable text", () => {
    const html = `<html><head><title>T</title><style>p{color:red}</style><script>alert(1)</script></head>
      <body><h1>Report</h1><p>Income was EUR&nbsp;412,000 &amp; rising.</p><ul><li>One</li><li>Two</li></ul><!-- hidden --></body></html>`;
    const text = htmlToText(html);
    assert.doesNotMatch(text, /alert|color:red|hidden|</);
    assert.match(text, /Report\n\nIncome was EUR 412,000 & rising\.\n\nOne\n\nTwo/);
  });

  it("decodes text files and rejects unsupported ones", async () => {
    const file = (name: string, content: string) => ({ name, arrayBuffer: async () => new TextEncoder().encode(content).buffer as ArrayBuffer });
    const noPdf = async (): Promise<PdfJsLike> => {
      throw new Error("not needed");
    };
    assert.deepEqual(await extractText(file("a.md", "# Title\r\n\r\nBody"), noPdf), { kind: "markdown", text: "# Title\n\nBody", warning: undefined });
    assert.match((await extractText(file("empty.txt", "  "), noPdf)).warning ?? "", /no text/);
    await assert.rejects(extractText(file("a.docx", "x"), noPdf), /Unsupported file type/);
  });

  it("warns when a PDF has no text layer", async () => {
    const emptyPdf: PdfJsLike = {
      getDocument: () => ({
        promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [] }) }) }),
        destroy: async () => {},
      }),
    };
    const result = await extractText({ name: "scan.pdf", arrayBuffer: async () => new ArrayBuffer(4) }, async () => emptyPdf);
    assert.equal(result.text, "");
    assert.match(result.warning ?? "", /scanned/);
  });
});

describe("closest passage for a quote that is not word for word", () => {
  // The first paragraph of the Wikipedia article as read on the class 1 laptop (October 2026).
  const ARTICLE =
    "Augusta Ada King, Countess of Lovelace (née Byron; 10 December 1815 – 27 November 1852), also known as Ada Lovelace, was an English mathematician and writer chiefly known for work on Charles Babbage's proposed mechanical general-purpose computer, the analytical engine. She was the first to recognise the machine had applications beyond pure calculation. Lovelace is often considered the first computer programmer.";
  // The quote Qwen3.5-2B gave: a real start, finished from memory.
  const QUOTE =
    "Augusta Ada King, Countess of Lovelace (née Byron; 10 December 1815 – 27 November 1852), also known as Ada Lovelace, was an English mathematician and computer programmer.";

  it("shows what the model changed in the class 1 Ada Lovelace quote", () => {
    const [checked] = checkEvidence([{ docId: "wikipedia:Ada_Lovelace", quote: QUOTE }], () => ARTICLE);
    assert.equal(checked!.verified, false);
    const parts = checked!.closest!;
    assert.match(parts[0]!.text, /^Augusta Ada King, .* was an English mathematician and$/);
    assert.deepEqual(parts.slice(1), [
      { kind: "source-only", text: "writer chiefly known for work on Charles Babbage's proposed mechanical general-purpose" },
      { kind: "same", text: "computer," },
      { kind: "quote-only", text: "programmer." },
    ]);
  });

  it("gives nothing for an invented quote, and nothing for a verified one", () => {
    const [invented] = checkEvidence([{ docId: "d", quote: "she invented the telephone in 1876" }], () => ARTICLE);
    assert.equal(invented!.closest, undefined);
    const [real] = checkEvidence([{ docId: "d", quote: "the first to recognise the machine had applications" }], () => ARTICLE);
    assert.equal(real!.verified, true);
    assert.equal(real!.closest, undefined);
  });

  it("finds a changed word in the middle of a long document", () => {
    const text = `${"Unrelated filler sentence here. ".repeat(500)}The recommended dictionary size is 112 KiB for small files. ${"More filler. ".repeat(500)}`;
    const parts = closestPassage("The recommended dictionary size is 128 KiB for small files.", text)!;
    assert.deepEqual(parts, [
      { kind: "same", text: "The recommended dictionary size is" },
      { kind: "quote-only", text: "128" },
      { kind: "source-only", text: "112" },
      { kind: "same", text: "KiB for small files." },
    ]);
  });
});

describe("quote checks from the second live run", () => {
  const ADA = readFileSync(new URL("./fixtures/ada-lovelace-lead.txt", import.meta.url), "utf8");
  const check = (quote: string, text = ADA) => checkEvidence([{ docId: "wikipedia:Ada_Lovelace", quote }], () => text)[0]!;

  it("still shows the diff for a real sentence finished from memory", () => {
    const misquote = check(
      "Augusta Ada King, Countess of Lovelace (née Byron; 10 December 1815 – 27 November 1852), also known as Ada Lovelace, was an English mathematician and computer programmer.",
    );
    assert.equal(misquote.verified, false);
    assert.ok(misquote.closest?.some((p) => p.kind === "source-only" && p.text.startsWith("writer chiefly known")));
  });

  it("shows no passage for quotes that are mostly invented", () => {
    for (const invented of [
      "She is best known for her work on the Analytical Engine, a mechanical device capable of performing a wide range of calculations, which she described as 'the analysis engine of the future.' She is widely recognized as the first person to write an algorithm intended to be processed by a computer, which she called 'Algorithm No. 62' for the Analytical Engine.",
      "She received the first computer programming award, the Charles Babbage Medal for the Analytical Engine, in 1936.",
    ]) {
      const checked = check(invented);
      assert.equal(checked.verified, false);
      assert.equal(checked.closest, undefined, invented.slice(0, 40));
    }
  });

  it("matches whole words only", () => {
    const abstract =
      "Analogical reasoning — the capacity to identify and map structural relationships between different domains — is fundamental to human cognition and learning. Recent studies have shown that large language models (LLMs) can sometimes match human performance on analogical reasoning tasks.";
    assert.equal(check("Recent studies have shown that large language models (LLMs) can sometimes match hum…", abstract).verified, false);
    assert.equal(check("Recent studies have shown that large language models (LLMs) can sometimes match human", abstract).verified, true);
    assert.equal(check("“Recent studies have shown that”", abstract).verified, true, "quotes and edge punctuation still ignored");
  });
});
