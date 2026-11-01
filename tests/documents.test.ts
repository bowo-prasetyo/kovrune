import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { answerStatus, checkEvidence, closestPassage, normalizeForMatch } from "../src/agent/evidence.ts";
import { ResearchLibrary } from "../src/agent/research.ts";
import { chunkDocument, parentId } from "../src/documents/chunk.ts";
import { detectKind, extractText, htmlToText, joinHyphenatedLines, type PdfJsLike } from "../src/documents/extract.ts";
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

  it("takes single and double quote marks as the same, since models write a passage's double quotes as single ones", () => {
    // A preview user's report: Wikipedia's "a system for electronic transactions without relying on
    // trust" was quoted with single quotes inside the JSON reply and marked not found.
    const history = 'This paper detailed methods of using a peer-to-peer network to generate what was described as "a system for electronic transactions without relying on trust".';
    const check = (quote: string) => checkEvidence([{ docId: "d", quote }], () => history)[0]!.verified;
    assert.equal(check("to generate what was described as 'a system for electronic transactions without relying on trust'."), true);
    assert.equal(check("to generate what was described as ‘a system for electronic transactions without relying on trust’."), true);
    assert.equal(check("to generate what was described as 'a system for electronic payments without relying on trust'."), false, "words must still match");
    assert.equal(normalizeForMatch(`“a” "b" ‘c’ 'd'`), "'a' 'b' 'c' 'd'");
  });

  it("ignores list markers, which models swap or drop when quoting slides", () => {
    // Class 1 preview check: the Papyrus PDF has "– Using", the model quoted "• Using", and the
    // quote failed although every word is in the slide. Another quote dropped the "•" bullets.
    const slide = "• Create a Papyrus project by :\n– Using the creation wizard :\n• Right click in Project\nExplorer view,";
    const slides = "• Select the UML Activity Diagram.\n• A new project is initialized with\na model and an Activity diagram.";
    const check = (quote: string, text: string) => checkEvidence([{ docId: "d", quote }], () => text)[0]!.verified;
    assert.equal(check("Create a Papyrus project by : • Using the creation wizard : • Right click in Project Explorer view,", slide), true);
    assert.equal(check("Select the UML Activity Diagram. A new project is initialized with a model", slides), true);
    assert.equal(check("Create a Papyrus project by : Using the creation wizard", slide), true);
    assert.equal(check("Create a Papyrus model by : Using the creation wizard", slide), false, "words must still match");
    assert.equal(normalizeForMatch("well-known - x • y"), "wellknown x y", "list markers go, hyphens inside words are ignored");
  });

  it("ignores Markdown emphasis and code marks, which models drop when quoting", () => {
    // Field suite (issue #35): the user guide has "**On the preview site,** ... called **Apps on
    // device**", the model quoted it without the asterisks, and the right answer failed its quote.
    const guide = "**On the preview site,** the page is on the web. That permission is called **Apps on device**.";
    const steps = "In the terminal where `llama-server` runs, press **Ctrl+C** to stop it. Set __max_tokens__ low.";
    const check = (quote: string, text: string) => checkEvidence([{ docId: "d", quote }], () => text)[0]!.verified;
    assert.equal(check("On the preview site, the page is on the web. That permission is called Apps on device.", guide), true);
    assert.equal(check("That permission is called **Apps on device**", guide), true, "quotes that keep the marks still match");
    assert.equal(check("In the terminal where llama-server runs, press Ctrl+C to stop it.", steps), true);
    assert.equal(check("Set max_tokens low", steps), true, "underscores inside words stay");
    assert.equal(check("That permission is called Apps on computer", guide), false, "words must still match");
  });

  it("reads Markdown links and backslash escapes as they read, which models quote", () => {
    // Field suite, harness 0.32.0 baselines: 2B quoted the user guide as it reads and both right
    // answers failed their quote (f48, f53).
    const setup = "**Or run it locally.** You need [Node.js](https://nodejs.org/) 22 or newer and git. In a terminal:";
    const table =
      "| `couldn't bind HTTP server socket ... port: 8080` | Another server (often an earlier llama-server) is using the port | `ss -ltnp \\| grep 8080` shows it; stop it with `pkill -x llama-server`, or start on another port (`--port 8081`) and use that address in the app |";
    const check = (quote: string, text: string) => checkEvidence([{ docId: "d", quote }], () => text)[0]!.verified;
    assert.equal(check("You need Node.js 22 or newer and git.", setup), true);
    assert.equal(
      check("`ss -ltnp | grep 8080` shows it; stop it with `pkill -x llama-server`, or start on another port (`--port 8081`) and use that address in the app", table),
      true,
    );
    assert.equal(check("You need [Node.js](https://nodejs.org/) 22 or newer", setup), true, "quotes that keep the link still match");
    assert.equal(check("ss -ltnp \\| grep 8080 shows it", table), true, "and quotes that keep the escape");
    assert.equal(check("You need nodejs.org 22 or newer", setup), false, "a link's address is not its text");
    assert.equal(check("You need Node.js 20 or newer and git.", setup), false, "words must still match");

    const images = 'See ![the model test](img/test.png "Model test") and [the guide on servers](https://example.org/a_(b)) first.';
    assert.equal(normalizeForMatch(images), "see the model test and the guide on servers first.");
    assert.equal(normalizeForMatch("C:\\Users\\me and 2 \\* 3"), "c:\\users\\me and 2 3", "only punctuation is escaped");

    // The passage shown with a verified quote is found in the source, links and all.
    const [verified] = checkEvidence([{ docId: "d", quote: "You need Node.js 22 or newer and git." }], () => setup);
    assert.equal(verified!.context?.passage, "You need [Node.js](https://nodejs.org/) 22 or newer and git.");
    const spaced = "Install [Node js](https://nodejs.org/) 22 or newer first.";
    assert.equal(checkEvidence([{ docId: "d", quote: "Install Node js 22 or newer" }], () => spaced)[0]!.context?.passage, "Install [Node js](https://nodejs.org/) 22 or newer");
  });

  it("does not pair different symbols in the closest-passage diff", () => {
    // Class 1 preview check: the diff showed "Choose • Papyrus Project »", pairing the quote's "«"
    // with the source's "•" because neither has letters.
    const source = "• Select « New » > « Other ... », • Choose « Papyrus Project », – Or using the file menu action,";
    const parts = closestPassage("Right click, Select « New » > « Other ... », Choose « Papyrus Project ».", source)!;
    const shown = parts.filter((p) => p.kind !== "quote-only").map((p) => p.text).join(" ");
    assert.match(shown, /Choose « Papyrus Project/);
    assert.doesNotMatch(shown, /Choose •/);
    assert.ok(parts.some((p) => p.kind === "same" && p.text.includes("Choose « Papyrus Project »")), "« and » pair with themselves");
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

  const check = (quote: string, text: string) => checkEvidence([{ docId: "d", quote }], () => text)[0]!;

  it("verifies a quote that leaves words out with an ellipsis (benchmark task r01)", () => {
    // Qwen3.5-4B quoted "LumenDB ... has been maintained by the Tessel Foundation since 2022." and the
    // right answer failed its quote check.
    const overview = corpus.find((doc) => doc.id === "lumen-overview")!.text;
    for (const quote of [
      "LumenDB ... has been maintained by the Tessel Foundation since 2022.",
      "LumenDB … has been maintained by the Tessel Foundation since 2022.",
      "LumenDB [...] has been maintained by the Tessel Foundation since 2022.",
      "LumenDB is an embedded key-value store ... maintained by the Tessel Foundation",
    ]) {
      const checked = check(quote, overview);
      assert.equal(checked.verified, true, quote);
      // The passage shown is the source's own text, including the words the quote left out.
      assert.match(checked.context!.passage, /^LumenDB is an embedded .* by Mira Okafor .* the Tessel Foundation/s, quote);
    }
  });

  it("rejects an ellipsis that joins pieces out of order, far apart, or too short to be a quote", () => {
    const text = `The fix is included in 3.2. ${"Unrelated text. ".repeat(20)}The fix is not included in 3.1.`;
    assert.equal(check("The fix is ... in 3.2.", text).verified, true);
    assert.equal(check("in 3.2 ... The fix is included", text).verified, false, "pieces must be in order");
    assert.equal(check("The fix is included ... not included in 3.1", text).verified, false, "an elision stands for at most 200 characters");
    assert.equal(check("The fix ... in ... 3.2", text).verified, false, "one piece must be three words long");
    assert.equal(check("The fix is ... in 3.4.", text).verified, false, "every piece must be in the source");
  });

  it("rejects an ellipsis that leaves out a negation", () => {
    const text = "Cobble is not released under the Apache-2.0 license. Cobble doesn't run on Windows. Cobble, which is written in Go, never loses data.";
    assert.equal(check("Cobble is ... released under the Apache-2.0 license", text).verified, false);
    assert.equal(check("Cobble ... run on Windows", text).verified, false);
    assert.equal(check("Cobble is not ... under the Apache-2.0 license", text).verified, true, "the negation is in the quote");
    assert.equal(check("Cobble, which ... never loses data", text).verified, true, "the left-out words do not negate");
  });

  it("records how many words an elided quote leaves out (audit N3)", () => {
    const text = "Cobble, which is written in Go, never loses data.";
    assert.equal(check("Cobble, which ... never loses data", text).elidedWords, 4);
    assert.equal(check("Cobble, which is written in Go, never loses data", text).elidedWords, undefined, "a whole quote leaves nothing out");
    const overview = corpus.find((doc) => doc.id === "lumen-overview")!.text;
    assert.equal(check("LumenDB ... has been maintained by the Tessel Foundation since 2022.", overview).elidedWords, 21);
  });

  it("reads a line break written out as text in a quote as whitespace (field task f74)", () => {
    // The model escaped the licence's line breaks twice in its JSON, so the quote has "\\n\\n" where the
    // source has a blank line.
    const source = "10.3. Modified Versions\n\nIf you create software not governed by this License, and you want to\ncreate a new license for such software, you may create and use a\nmodified version of this License if you rename the license.";
    const quote = "10.3. Modified Versions\\n\\nIf you create software not governed by this License, and you want to\\ncreate a new license for such software";
    const checked = check(quote, source);
    assert.equal(checked.verified, true);
    assert.match(checked.context!.passage, /^10\.3\. Modified Versions\n\nIf you create .* for such software,?$/s, "the passage shown is the source's own text");
    // Characters that are written out in the source too still match a quote of them.
    assert.equal(check("Use \\n to end a line in the string", "Use \\n to end a line in the string literal.").verified, true);
    // A quote that is nearly right still gets its closest passage, without "\\n" in its words.
    const near = check("If you create software\\nnot covered by this License", source);
    assert.equal(near.verified, false);
    assert.ok(near.closest?.some((part) => part.kind === "quote-only" && part.text === "covered"));
    assert.ok(!near.closest?.some((part) => /\\n/.test(part.text)));
  });

  it("matches ligatures, soft hyphens and words hyphenated at a line end", () => {
    const quote = "the financial statements were audited";
    assert.equal(check(quote, "We confirm the ﬁnancial statements were audited.").verified, true, "ligature");
    assert.equal(check(quote, "We confirm the finan\u00adcial statements were audited.").verified, true, "soft hyphen");
    assert.equal(check(quote, "We confirm the finan-\ncial statements were audited.").verified, true, "line-end hyphen");
    assert.equal(check("a well-known result", "This is a well-\nknown result.").verified, true, "hyphenated word broken at its hyphen");
    assert.equal(check("the finance statements were audited", "We confirm the finan-\ncial statements were audited.").verified, false);
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

  it("joins words broken across lines at a hyphen, keeping the hyphen", async () => {
    // The field suite's design PDF breaks lines at compounds' own hyphens ("JSON-\nschema"), and
    // typeset papers hyphenate words ("finan-\ncial"): the two cannot be told apart.
    assert.equal(joinHyphenatedLines("text with JSON-\nschema and\nfinan- \ncial state-\nments"), "text with JSON-schema and\nfinan-cial state-ments");
    assert.equal(joinHyphenatedLines("finan­\ncial and soft­hyphens"), "financial and softhyphens");
    assert.equal(joinHyphenatedLines("A list:\n- one\n- two"), "A list:\n- one\n- two", "list markers stay on their lines");
    const lines = ["The finan-", "cial statements", "were audited."];
    const pdf: PdfJsLike = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
          getPage: async (n: number) => ({
            getTextContent: async () => ({ items: n === 1 ? lines.map((str) => ({ str, hasEOL: true })) : [{ str: "Page two." }] }),
          }),
        }),
        destroy: async () => {},
      }),
    };
    const result = await extractText({ name: "paper.pdf", arrayBuffer: async () => new ArrayBuffer(4) }, async () => pdf);
    assert.equal(result.text, "The finan-cial statements\nwere audited.\n\nPage two.");
    assert.equal(result.text.slice(result.pageStarts![1]), "Page two.", "page offsets follow the joined text");
    const [checked] = checkEvidence([{ docId: "paper", quote: "the financial statements were audited" }], () => result.text, () => result.pageStarts);
    assert.equal(checked!.verified, true);
  });

  it("drops soft hyphens from text and HTML files", async () => {
    const file = (name: string, content: string) => ({ name, arrayBuffer: async () => new TextEncoder().encode(content).buffer as ArrayBuffer });
    const noPdf = async (): Promise<PdfJsLike> => {
      throw new Error("not needed");
    };
    assert.equal((await extractText(file("a.txt", "finan­cial"), noPdf)).text, "financial");
    assert.equal((await extractText(file("a.html", "<p>finan&shy;cial and data&#173;base</p>"), noPdf)).text, "financial and database");
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
    assert.equal(check("is fundamental to human cognition and learning. […]", abstract).verified, true, "a snippet's […] marker is ignored");
  });
});
