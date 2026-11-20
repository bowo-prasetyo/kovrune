// The social-sciences audit's recommendations 1–5 (docs/social-sciences-audit.md, harness 0.101.0): numbers
// written without their leading zero, footnote and citation markers a quote leaves out, PDF footnotes read
// after the sentence they would cut, JATS tables with merged cells and floats, and OpenAlex's retractions,
// fields and Zenodo copies.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkEvidence, withoutNoteMarkers } from "../src/agent/evidence.ts";
import { numbers, sentenceSupport } from "../src/agent/support.ts";
import { footnotesAt, pageTexts, type PdfLine } from "../src/documents/pdf-layout.ts";
import { createZenodoReader } from "../src/sources/datacite.ts";
import { jatsToMarkdown, parseXml } from "../src/sources/jats.ts";
import { createOpenAlex, fullTextIds, OPENALEX_FIELDS, OPENALEX_RETRACTED_NOTE, openAlexFilter, workText, zenodoRecordIn, type Work } from "../src/sources/openalex.ts";
import type { FetchLike, OpenSource } from "../src/sources/types.ts";

const mark = (quote: string, answer: string) =>
  sentenceSupport(answer, [{ docId: "d", quote, verified: true }], () => "Survey study").sentences.map((s) => (s.backed === undefined ? "·" : s.backed ? "✓" : "⚠")).join("");

describe("numbers written without their leading zero (S1)", () => {
  it("are read with it, and with their sign", () => {
    assert.deepEqual(numbers("p < .05"), ["0.05"]);
    assert.deepEqual(numbers("p =.029"), ["0.029"]);
    assert.deepEqual(numbers("r = −.34"), ["-0.34"]);
    assert.deepEqual(numbers("(−.12) and -.5"), ["-0.12", "-0.5"]);
    assert.deepEqual(numbers("Cronbach's α = .82"), ["0.82"]);
  });

  it("leave a decimal, a version, an abbreviation and an ellipsis alone", () => {
    assert.deepEqual(numbers("3.5 and v.2 and ... 5"), ["3.5", "2", "5"]);
    assert.deepEqual(numbers("1,204 respondents"), ["1204"]);
  });

  it("back a sentence giving the same value with a leading zero, and not one that drops the sign", () => {
    assert.equal(mark("Effect size was moderate (d = .45).", "Effect size was moderate (d = 0.45)."), "✓");
    assert.equal(mark("Effect size was moderate (d = 0.45).", "Effect size was moderate (d = .45)."), "✓");
    assert.equal(mark("The effect of tutoring on reading scores was significant (p < .05).", "The effect of tutoring on reading scores was significant (p < 0.05)."), "✓");
    const q = "Social trust was correlated with perceived corruption (r = −.34, n = 812).";
    assert.equal(mark(q, "Social trust was correlated with perceived corruption (r = −0.34, n = 812)."), "✓");
    assert.equal(mark(q, "Social trust was correlated with perceived corruption (r = .34, n = 812)."), "⚠", "the sign is checked");
    assert.equal(mark(q, "Social trust was correlated with perceived corruption in 34% of the 812 cases."), "⚠", ".34 is not 34");
  });
});

describe("footnote and citation markers a quote leaves out (S3)", () => {
  const verified = (text: string, quote: string) => checkEvidence([{ docId: "d", quote }], () => text)[0]!;

  it("are not needed in the quote: raised numbers, numbers after punctuation, and numbers in brackets", () => {
    for (const [text, quote] of [
      ["We test this claim with¹ panel data from 2,118 municipalities.", "We test this claim with panel data from 2,118 municipalities"],
      ["the state is weak.12 Yet elites persisted in the provinces", "the state is weak. Yet elites persisted in the provinces"],
      ["the state is weak,³ yet elites persisted in the provinces", "the state is weak, yet elites persisted in the provinces"],
      ["as Weber argued.[14] Bureaucracy spreads through the state", "as Weber argued. Bureaucracy spreads through the state"],
      ["as Weber argued[3, 5]. Bureaucracy spreads through the state", "as Weber argued. Bureaucracy spreads through the state"],
      ["support rose sharply¹⁻³ after the reform was passed", "support rose sharply after the reform was passed"],
    ]) {
      assert.equal(verified(text!, quote!).verified, true, text);
    }
  });

  it("shows the passage as the source has it, markers included", () => {
    const checked = verified("Before. We test this claim with¹ panel data from 2,118 municipalities. After.", "We test this claim with panel data from 2,118 municipalities");
    assert.equal(checked.context?.passage, "We test this claim with¹ panel data from 2,118 municipalities.");
  });

  it("does not take a power, a figure's number, or a quoted marker the source lacks", () => {
    for (const [text, quote] of [
      ["The plot covers 30 km² of farmland near the river.", "The plot covers 30 km of farmland near the river"],
      ["The model fit was good (R² = 0.42) in the sample.", "The model fit was good (R = 0.42) in the sample"],
      ["Results are shown in Fig.3 for each district studied.", "Results are shown in Fig. for each district studied"],
      ["We test this claim with panel data from 2,118 municipalities.", "We test this claim with¹ panel data from 2,118 municipalities"],
      ["turnout rose by 12 points in 2016 across the districts", "turnout rose by points in 2016 across the districts"],
    ]) {
      assert.equal(verified(text!, quote!).verified, false, text);
    }
  });

  it("are blanked one space per character, so offsets hold", () => {
    const text = "weak.12 Yet with¹ and [14] here";
    assert.equal(withoutNoteMarkers(text).length, text.length);
    assert.equal(withoutNoteMarkers(text), "weak.   Yet with  and      here");
  });
});

describe("PDF footnotes read after the sentence they would cut (S3)", () => {
  const line = (text: string, y: number, h = 11): PdfLine => ({ text, x: 72, y, h });
  const page1 = [
    line("Prior work finds that civic participation declines as commuting time", 700),
    line("grows. We test this claim with¹ panel data from 2,118 municipalities and", 685),
    line("find that longer commutes are associated with higher turnout among homeowners²", 670),
    line("1 Putnam's argument rests on time-use surveys from 1965 to 1995.", 98, 8),
    line("2 Turnout among renters fell slightly, though not significantly.", 88, 8),
  ];
  const page2 = [line("but not among renters, which suggests that residential stake matters.", 700), line("A new paragraph starts here after a wider gap than usual.", 650)];

  it("finds a page's footnotes: its last lines, in a smaller size, starting with a number", () => {
    assert.equal(footnotesAt(page1), 3);
    assert.equal(footnotesAt(page2), 2, "none");
    assert.equal(footnotesAt([...page1.slice(0, 3), line("Note: Standard errors in parentheses. *p < .05.", 98, 8)]), 4, "a table note is not one");
  });

  it("moves them after the paragraph that finishes the sentence, and leaves other pages as they were", () => {
    const [first, second] = pageTexts([page1, page2]);
    assert.doesNotMatch(first!, /Putnam's argument/);
    assert.match(second!, /^but not among renters, which suggests that residential stake matters\.\n\n1 Putnam's argument[^\n]*\n2 Turnout[^\n]*\n\nA new paragraph/);
    const ended = [...page1.slice(0, 2), line("find that longer commutes raise turnout among homeowners.", 670), ...page1.slice(3)];
    assert.match(pageTexts([ended, page2])[0]!, /homeowners\.\n\n1 Putnam's/, "a page that ends a sentence keeps its notes");
  });

  it("lets a quote of the whole finding be found", () => {
    const text = pageTexts([page1, page2]).join("\n\n");
    const [checked] = checkEvidence([{ docId: "d", quote: "longer commutes are associated with higher turnout among homeowners but not among renters" }], () => text);
    assert.equal(checked!.verified, true);
  });
});

describe("JATS tables (S4)", () => {
  const article = (body: string, floats = "") =>
    `<article><front><journal-meta><journal-title>J</journal-title></journal-meta><article-meta><article-title>T</article-title><pub-date><year>2025</year></pub-date></article-meta></front><body>${body}</body>${floats}</article>`;
  const regression = `<table-wrap id="t2"><label>Table 2</label><caption><p>OLS estimates.</p></caption><table>
    <thead><tr><th/><th colspan="2">Model A</th><th colspan="2">Model B</th></tr>
    <tr><th>Variable</th><th>Female</th><th>Male</th><th>Female</th><th>Male</th></tr></thead>
    <tbody><tr><td rowspan="2">Top 5% share</td><td>−0.0093*</td><td>−0.0138**</td><td><bold>−0.0089</bold></td><td>−0.0133</td></tr>
    <tr><td>(0.0033)</td><td>(0.0045)</td><td>(0.0030)</td><td>(0.0050)</td></tr>
    <tr><td colspan="5">Controls</td></tr></tbody></table>
    <table-wrap-foot><p>Bold = p &lt; 0.05.</p></table-wrap-foot></table-wrap>`;

  it("spreads cells over the columns and rows they span, and marks a cell set all in bold", () => {
    const md = jatsToMarkdown(parseXml(article(`<sec><title>Results</title><p>See below.</p>${regression}</sec>`)));
    assert.match(md, /\| {2}\| Model A \| Model A \| Model B \| Model B \|/);
    assert.match(md, /\| Top 5% share \| −0\.0093\* \| −0\.0138\*\* \| \*\*−0\.0089\*\* \| −0\.0133 \|/);
    assert.match(md, /\| Top 5% share \| \(0\.0033\) \| \(0\.0045\) \| \(0\.0030\) \| \(0\.0050\) \|/, "each error under its estimate");
    assert.match(md, /\| Controls \| {2}\| {2}\| {2}\| {2}\|/, "a spanning data cell is written once");
  });

  it("places a table from <floats-group> after the paragraph that first cites it, and others at the end", () => {
    const floats = `<floats-group>${regression}<table-wrap id="t9"><label>Table 9</label><caption><p>Never cited.</p></caption><table><tr><td>a</td><td>b</td></tr></table></table-wrap></floats-group>`;
    const md = jatsToMarkdown(parseXml(article(`<sec><title>Results</title><p>Estimates are in <xref rid="t2" ref-type="table">Table 2</xref>.</p><p>Next paragraph.</p></sec>`, floats)));
    assert.match(md, /Estimates are in Table 2\.\n\n\*\*Table 2\*\* OLS estimates\.[\s\S]*Bold = p < 0\.05\.\n\nNext paragraph\./);
    assert.match(md, /\*\*Table 9\*\* Never cited\.\n\n\| a \| b \|\n$/);
    assert.equal(md.match(/\*\*Table 2\*\*/g)?.length, 1, "once");
  });

  it("writes no empty heading for a table without a label", () => {
    const md = jatsToMarkdown(parseXml(article(`<p>Text.</p><table-wrap><table><tr><td>a</td><td>b</td></tr></table></table-wrap>`)));
    assert.doesNotMatch(md, /\*\*\*\*/);
    assert.match(md, /Text\.\n\n\| a \| b \|/);
  });
});

/** A fetch that answers from fixed routes. */
function fakeFetch(routes: Array<[RegExp, unknown, number?]>): FetchLike {
  return (async (url: string) => {
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) throw new TypeError("Failed to fetch");
    const [, body, status = 200] = route;
    const bytes = body instanceof Uint8Array ? body : undefined;
    return { ok: status < 400, status, json: async () => body, ...(bytes ? { arrayBuffer: async () => bytes.buffer.slice(0) } : {}) };
  }) as FetchLike;
}

describe("OpenAlex for the social sciences (S5, S6)", () => {
  const retracted: Work = {
    id: "https://openalex.org/W1983960628",
    display_name: "When contact changes minds: An experiment on transmission of support for gay equality",
    publication_year: 2014,
    is_retracted: true,
    abstract_inverted_index: { Canvassers: [0], changed: [1], minds: [2] },
  };

  it("puts a note first in a retracted work's text, and says so in its search result", async () => {
    assert.ok(workText(retracted).startsWith(`${OPENALEX_RETRACTED_NOTE}\n${retracted.display_name}`));
    assert.ok(!workText({ ...retracted, is_retracted: false }).includes("retracted"));
    const openalex = createOpenAlex(fakeFetch([[/\/works\?/, { results: [retracted, { ...retracted, id: "https://openalex.org/W2", is_retracted: false }] }]]));
    const hits = await openalex.search("contact canvassing");
    assert.deepEqual(hits.map((h) => h.title.replace(/^.*\(/, "(")), ["(RETRACTED, 2014)", "(2014)"]);
  });

  it("offers the social sciences' fields", () => {
    for (const id of ["fields/33", "fields/32", "fields/20", "fields/14", "fields/18", "fields/12"]) {
      assert.ok(OPENALEX_FIELDS.some(([field]) => field === id), id);
    }
    assert.equal(openAlexFilter({ field: "fields/33" }), "primary_topic.field.id:fields/33");
  });

  it("reads a work from its Zenodo copy only when DataCite's reader is given, its record's own link first", () => {
    const zenodo = { name: "datacite", label: "Zenodo" } as OpenSource;
    const work: Work = {
      id: "https://openalex.org/W4399312134",
      doi: "https://doi.org/10.38124/ijisrt/ijisrt23may934",
      locations: [
        { landing_page_url: "https://doi.org/10.5281/zenodo.7976341" },
        { landing_page_url: "https://zenodo.org/record/7976342", pdf_url: "https://zenodo.org/records/7976342/files/IJISRT23MAY934.pdf" },
      ],
    };
    assert.deepEqual(fullTextIds(work, {}), []);
    assert.deepEqual(fullTextIds(work, { zenodo }).map((r) => r.id), ["zenodo:7976342"]);
    assert.deepEqual(fullTextIds({ id: "W1", doi: "https://doi.org/10.5281/zenodo.7716415" }, { zenodo }).map((r) => r.id), ["zenodo:7716415"]);
    assert.equal(zenodoRecordIn("https://example.org/records/5"), undefined);
  });

  it("reads a Zenodo record's PDF, and fails when it has none, so the work is read as its abstract", async () => {
    const pdf = new Uint8Array([37, 80, 68, 70]);
    const files = { files: [{ key: "paper.pdf", size: 4, links: { self: "https://zenodo.org/api/records/7/files/paper.pdf/content" } }] };
    const reader = createZenodoReader({
      fetchImpl: fakeFetch([[/\/content$/, pdf], [/records\/7$/, files], [/records\/8$/, { files: [] }]]),
      extractPdf: async () => ({ text: "The full paper.", pageStarts: [0] }),
    });
    const read = await reader.fetch("zenodo:7");
    assert.equal(read.text, "The full paper.");
    assert.equal(read.url, "https://zenodo.org/records/7");
    await assert.rejects(reader.fetch("zenodo:8"), /no PDF on Zenodo/);

    const work = { ...retracted, is_retracted: false, id: "https://openalex.org/W9", locations: [{ landing_page_url: "https://zenodo.org/records/8" }] };
    const openalex = createOpenAlex(fakeFetch([[/\/works\/W9/, work]]), undefined, {}, { zenodo: reader });
    const doc = await openalex.fetch("openalex:W9");
    assert.match(doc.text, /Abstract: Canvassers changed minds/);
  });
});
