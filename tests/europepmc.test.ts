import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { answerToBibtex, type SavedAnswer } from "../src/app/research/answers.ts";
import { createEuropePmc, FULL_TEXT_TIMEOUT_MS, plainTerms, PROTOCOL_NOTE, rankHits, relatedReport, RETRACTED_NOTE, searchTerms, studyTypes, type EuropePmcRecord } from "../src/sources/europepmc.ts";
import { jatsToMarkdown, parseXml } from "../src/sources/jats.ts";
import { SourceError, type FetchLike } from "../src/sources/types.ts";

/** The record of one of the clinical suite's trials, in the shape Europe PMC's search returns (resultType=core, checked live 2026-11-13). */
const CARRAGEENAN: EuropePmcRecord = {
  id: "39593091",
  source: "MED",
  pmid: "39593091",
  pmcid: "PMC11590543",
  doi: "10.1186/s12916-024-03771-8",
  title: "Carrageenan and insulin resistance in humans: a randomised double-blind cross-over trial.",
  authorString: "Wagner R, Buettner J, Heni M.",
  authorList: { author: [{ fullName: "Wagner R" }, { fullName: "Buettner J" }, { fullName: "Heni M" }] },
  journalInfo: { journal: { title: "BMC medicine" } },
  pubYear: "2024",
  isOpenAccess: "Y",
  pubTypeList: { pubType: ["Research Support, Non-U.S. Gov't", "research-article", "Randomized Controlled Trial", "Journal Article"] },
  abstractText:
    "<h4>Background</h4>The potential impact of specific food additives on the risk of developing type 2 diabetes is not well understood.<h4>Methods</h4>In a randomised, double-blind, placebo-controlled, cross-over trial, 20 males (BMI 24.5 ± 2.5 kg/m<sup>2</sup>) participated.",
};
/** A PubMed record with no open-access full text. */
const CLOSED: EuropePmcRecord = {
  id: "33792262",
  source: "MED",
  pmid: "33792262",
  title: "Unfavorable hydroxychloroquine COVID-19 research associated with authors having a history of political party donations.",
  authorString: "Bushman D, Alroy KA, Greene SK.",
  journalInfo: { journal: { title: "Medicine" } },
  pubYear: "2021",
  isOpenAccess: "N",
  pubTypeList: { pubType: ["Journal Article"] },
  abstractText: "We studied donations.",
};
/** A retracted trial with an open-access full text. */
const RETRACTED: EuropePmcRecord = {
  ...CARRAGEENAN,
  id: "39702045",
  pmid: "39702045",
  pmcid: "PMC11657509",
  title: "Cardiac findings in a phase II double-blind randomized trial.",
  pubTypeList: { pubType: ["Clinical Trial, Phase II", "Retracted Publication", "research-article", "Randomized Controlled Trial", "Journal Article"] },
};

const XML_DIR = new URL("./fixtures/europepmc/", import.meta.url);
const carrageenanXml = () => readFile(new URL("PMC11590543.xml", XML_DIR));

interface Routes {
  /** Search results by query: the first route whose pattern the query matches answers. */
  searches?: Array<[RegExp, EuropePmcRecord[]]>;
  /** Full texts by ID, or an HTTP status. */
  texts?: Record<string, Uint8Array | number>;
}

/** A fetch answering Europe PMC's search and full-text URLs, recording the URLs and timeouts asked for. */
function fakeFetch(routes: Routes): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const reply = (status: number, body: unknown, bytes?: Uint8Array) => ({
    ok: status < 400,
    status,
    json: async () => body,
    ...(bytes ? { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer } : {}),
    headers: { get: () => null },
  });
  const impl = (async (url: string) => {
    urls.push(url);
    const search = /\/rest\/search\?(.*)$/.exec(url);
    if (search) {
      const query = new URLSearchParams(search[1]).get("query") ?? "";
      const records = routes.searches?.find(([pattern]) => pattern.test(query))?.[1] ?? [];
      return reply(200, { hitCount: records.length, resultList: { result: records } });
    }
    const text = /\/rest\/([A-Z0-9]+)\/fullTextXML$/.exec(url);
    const found = text && routes.texts?.[text[1]!];
    if (found instanceof Uint8Array) return reply(200, undefined, found);
    return reply(typeof found === "number" ? found : 404, {});
  }) as unknown as FetchLike & { urls: string[] };
  impl.urls = urls;
  return impl;
}

const queryOf = (url: string) => new URLSearchParams(url.split("?")[1]).get("query");

describe("JATS articles", () => {
  it("give the clinical suite's document, byte for byte, from Europe PMC's XML", async () => {
    const xml = new TextDecoder().decode(await carrageenanXml());
    const want = await readFile(new URL("../eval/clinical/docs/carrageenan-insulin.md", import.meta.url), "utf8");
    assert.equal(jatsToMarkdown(parseXml(xml)), want);
  });

  it("parse character references, CDATA, comments and a DOCTYPE with an internal subset", () => {
    const root = parseXml('<?xml version="1.0"?>\r\n<!DOCTYPE a [<!ENTITY x "y">]><a b="1 &amp; 2"><!-- c --><p>&lt;5 &#x2264;6 &#8805;7<![CDATA[ <b>raw</b> ]]><br/></p></a>');
    assert.equal(root.attrs.b, "1 & 2");
    const p = root.children[0] as { children: unknown[] };
    assert.deepEqual(p.children.slice(0, 2), ["<5 ≤6 ≥7", " <b>raw</b> "]);
    assert.throws(() => parseXml("<a><b></a>"), /Not well-formed XML/);
    assert.throws(() => parseXml("<a>"), /not closed/);
  });

  it("names an article without a PMCID, such as a preprint, by the ID it is given", () => {
    const xml = "<article><front><journal-meta><journal-title>medRxiv</journal-title></journal-meta><article-meta><article-title>T</article-title><pub-date><year>2026</year></pub-date></article-meta></front></article>";
    assert.match(jatsToMarkdown(parseXml(xml), "PPR1326190"), /medRxiv \(2026\)\. DOI: \. PPR1326190\./);
    assert.match(jatsToMarkdown(parseXml(xml)), /medRxiv \(2026\)\. DOI: \.\n/);
  });
});

describe("Europe PMC", () => {
  it("searches the model's words, all of them, among works with something to read", async () => {
    const fetchImpl = fakeFetch({ searches: [[/carrageenan/, [CARRAGEENAN, CLOSED]]] });
    const hits = await createEuropePmc(fetchImpl).search("carrageenan insulin resistance", undefined);
    assert.equal(queryOf(fetchImpl.urls[0]!), "(carrageenan insulin resistance) AND (HAS_ABSTRACT:y OR OPEN_ACCESS:y)");
    assert.equal(new URLSearchParams(fetchImpl.urls[0]!.split("?")[1]).get("resultType"), "core");
    assert.deepEqual(
      hits.map((h) => h.id),
      ["europepmc:MED/39593091", "europepmc:MED/33792262"],
    );
    assert.equal(hits[0]!.title, "Carrageenan and insulin resistance in humans: a randomised double-blind cross-over trial. (2024, BMC medicine; randomized controlled trial; full text)");
    assert.equal(hits[1]!.title.endsWith("(2021, Medicine; abstract only)"), true);
    assert.match(hits[0]!.snippet, /^Background The potential impact/, "the abstract's headings become words");
    assert.match(hits[0]!.snippet, /kg\/m2\) participated\.$/);
  });

  it("shows the five results that best match the words in their title and abstract, and are cited most", async () => {
    // As for "REVAMP trial oral iron standard-of-care": Europe PMC put papers that name the trial in their
    // full text first, and the trial's own report 16th.
    const report: EuropePmcRecord = { ...CLOSED, id: "37088092", title: "Ferric carboxymaltose versus standard-of-care oral iron in Malawian pregnant women (REVAMP)", abstractText: "A randomised trial of oral iron.", citedByCount: 120 };
    const mentions = Array.from({ length: 15 }, (_, i): EuropePmcRecord => ({ ...CLOSED, id: String(100 + i), title: `Paper ${i} on malaria`, abstractText: "Pregnant women in Malawi.", citedByCount: 3 }));
    const fetchImpl = fakeFetch({ searches: [[/REVAMP/, [...mentions, report]]] });
    const hits = await createEuropePmc(fetchImpl).search("REVAMP trial oral iron standard-of-care", undefined);
    assert.equal(new URLSearchParams(fetchImpl.urls[0]!.split("?")[1]).get("pageSize"), "25");
    assert.equal(hits.length, 5);
    assert.equal(hits[0]!.id, "europepmc:MED/37088092");
    assert.deepEqual(hits.slice(1).map((h) => h.id), ["europepmc:MED/100", "europepmc:MED/101", "europepmc:MED/102", "europepmc:MED/103"], "Europe PMC's order breaks ties");
  });

  it("weighs a paper's citations less than the words it matches", () => {
    const cited: EuropePmcRecord = { ...CLOSED, id: "1", title: "Iron in pregnancy", abstractText: "", citedByCount: 500 };
    const matching: EuropePmcRecord = { ...CLOSED, id: "2", title: "Ferric carboxymaltose for anaemia in pregnancy", abstractText: "", citedByCount: 0 };
    assert.deepEqual(rankHits([cited, matching], ["ferric", "carboxymaltose", "anaemia", "pregnancy"]).map((r) => r.id), ["2", "1"]);
    const twin = { ...matching, id: "3", citedByCount: 40 };
    assert.deepEqual(rankHits([matching, twin], ["ferric", "carboxymaltose"]).map((r) => r.id), ["3", "2"], "between equal matches, the one cited more");
  });

  it("names secondary analyses, substudies and protocols", async () => {
    const titled = (title: string, pubType: string[] = ["Journal Article"]) => relatedReport({ ...CLOSED, title, pubTypeList: { pubType } });
    assert.equal(titled("Prenatal Intravenous Iron and Child Growth: A Secondary Analysis of a Randomized Clinical Trial"), "secondary analysis");
    assert.equal(titled("Effects of Ferric Carboxymaltose on Pica among Pregnant Women in Malawi: A Substudy to a Randomized Trial"), "secondary analysis");
    assert.equal(titled("A post hoc analysis of the COPCOV trial"), "secondary analysis");
    assert.equal(titled("Protocol and statistical analysis plan for a randomized controlled trial"), "protocol");
    assert.equal(titled("Iron in pregnancy", ["Clinical Trial Protocol"]), "protocol");
    assert.equal(titled("Ferric carboxymaltose versus standard-of-care oral iron: a randomised controlled trial"), undefined);
    const secondary = { ...CARRAGEENAN, title: "Carrageenan and the gut: a secondary analysis of a randomised trial" };
    const hits = await createEuropePmc(fakeFetch({ searches: [[/carrageenan/, [secondary]]] })).search("carrageenan", undefined);
    assert.match(hits[0]!.title, /\(2024, BMC medicine; randomized controlled trial; secondary analysis; full text\)$/);
  });

  it("asks for any of the words when no work has all of them", async () => {
    const fetchImpl = fakeFetch({ searches: [[/hydroxychloroquine OR/, [CLOSED]]] });
    const hits = await createEuropePmc(fetchImpl).search("hydroxychloroquine donations zebrafish", undefined);
    assert.equal(hits.length, 1);
    assert.deepEqual(
      fetchImpl.urls.map(queryOf),
      ["(hydroxychloroquine donations zebrafish) AND (HAS_ABSTRACT:y OR OPEN_ACCESS:y)", "(hydroxychloroquine OR donations OR zebrafish) AND (HAS_ABSTRACT:y OR OPEN_ACCESS:y)"],
    );
  });

  it("searches words, not Europe PMC's syntax", () => {
    assert.deepEqual(plainTerms('TITLE:"malaria" AND (pregnancy OR -placebo) NOT x*'), ["TITLE", "malaria", "pregnancy", "placebo", "x"]);
    assert.deepEqual(plainTerms("sulfadoxine-pyrimethamine and IPTp"), ["sulfadoxine-pyrimethamine", "IPTp"]);
    assert.deepEqual(plainTerms(' "" () '), []);
  });

  it("leaves out the words that say how a question is asked, unless nothing else is left", async () => {
    assert.deepEqual(searchTerms("What was the mean age of the children in the Vi-TT group?"), ["mean", "age", "children", "Vi-TT", "group"]);
    assert.deepEqual(searchTerms("What is it?"), ["What", "is", "it"]);
    const fetchImpl = fakeFetch({});
    await createEuropePmc(fetchImpl).search("How was the dose of folic acid chosen", undefined);
    assert.equal(queryOf(fetchImpl.urls[0]!), "(dose folic acid chosen) AND (HAS_ABSTRACT:y OR OPEN_ACCESS:y)");
  });

  it("names the kinds of study and marks retracted works", async () => {
    assert.deepEqual(studyTypes(RETRACTED), ["randomized controlled trial", "clinical trial"]);
    assert.deepEqual(studyTypes({ ...CLOSED, pubTypeList: { pubType: ["Meta-Analysis", "Systematic Review", "Journal Article"] } }), ["systematic review", "meta-analysis"]);
    assert.deepEqual(studyTypes({ ...CLOSED, source: "PPR", pubTypeList: { pubType: ["Preprint"] } }), ["preprint"]);
    const hits = await createEuropePmc(fakeFetch({ searches: [[/cardiac/, [RETRACTED]]] })).search("cardiac", undefined);
    assert.match(hits[0]!.title, /\(RETRACTED; 2024, BMC medicine; randomized controlled trial, clinical trial; full text\)$/);
  });

  it("reads an open-access work in full, from its XML", async () => {
    const fetchImpl = fakeFetch({ searches: [[/carrageenan/, [CARRAGEENAN]]], texts: { PMC11590543: await carrageenanXml() } });
    const europePmc = createEuropePmc(fetchImpl);
    await europePmc.search("carrageenan", undefined);
    const doc = await europePmc.fetch("europepmc:MED/39593091", undefined);
    const want = await readFile(new URL("../eval/clinical/docs/carrageenan-insulin.md", import.meta.url), "utf8");
    assert.equal(doc.text, want, "the text the clinical suite measured the models on");
    assert.equal(doc.url, "https://europepmc.org/article/MED/39593091");
    assert.deepEqual(doc.work, { authors: ["Wagner R", "Buettner J", "Heni M"], year: 2024, doi: "10.1186/s12916-024-03771-8", venue: "BMC medicine" });
    assert.equal(fetchImpl.urls.at(-1), "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11590543/fullTextXML");
    assert.equal(fetchImpl.urls.length, 2, "the record found by the search is not asked for again");
  });

  it("reads other works as their abstract, and says why", async () => {
    const europePmc = createEuropePmc(fakeFetch({ searches: [[/EXT_ID:33792262 AND SRC:MED/, [CLOSED]]] }));
    const doc = await europePmc.fetch("europepmc:MED/33792262", undefined);
    assert.equal(doc.id, "europepmc:MED/33792262");
    assert.match(doc.text, /^Unfavorable hydroxychloroquine/);
    assert.match(doc.text, /PMID: 33792262/);
    assert.match(doc.text, /Abstract:\nWe studied donations\./);
    assert.match(doc.text, /\(Europe PMC has no open-access full text for this work, so only its abstract was read\.\)$/);
  });

  it("falls back to the abstract when the full text can't be had, and waits long enough for a slow one", async () => {
    const fetchImpl = fakeFetch({ searches: [[/EXT_ID/, [CARRAGEENAN]]], texts: { PMC11590543: 500 } });
    const doc = await createEuropePmc(fetchImpl).fetch("europepmc:MED/39593091", undefined);
    assert.match(doc.text, /Abstract:\nBackground\nThe potential impact/);
    assert.match(doc.text, /did not give this work's full text, so only its abstract was read/);
    assert.ok(FULL_TEXT_TIMEOUT_MS >= 60_000, "a preprint's full text took 18 s in a check");
  });

  it("puts a retraction first in a retracted work's text", async () => {
    const europePmc = createEuropePmc(fakeFetch({ searches: [[/EXT_ID/, [RETRACTED]]], texts: { PMC11657509: await carrageenanXml() } }));
    const doc = await europePmc.fetch("europepmc:MED/39702045", undefined);
    assert.ok(doc.text.startsWith(`${RETRACTED_NOTE}\n\n# Carrageenan`));
    const abstractOnly = await createEuropePmc(fakeFetch({ searches: [[/EXT_ID/, [{ ...RETRACTED, isOpenAccess: "N" }]]] })).fetch("europepmc:MED/39702045", undefined);
    assert.ok(abstractOnly.text.startsWith(RETRACTED_NOTE));
  });

  it("puts first in a protocol's text that it gives the plan, not what was done", async () => {
    const protocol: EuropePmcRecord = { ...CARRAGEENAN, id: "34815287", title: "Protocol for a randomised controlled trial: the REVAMP trial", pubTypeList: { pubType: ["Clinical Trial Protocol", "Journal Article"] } };
    const doc = await createEuropePmc(fakeFetch({ searches: [[/EXT_ID/, [protocol]]], texts: { PMC11590543: await carrageenanXml() } })).fetch("europepmc:MED/34815287", undefined);
    assert.ok(doc.text.startsWith(`${PROTOCOL_NOTE}\n\n# Carrageenan`));
    const abstractOnly = await createEuropePmc(fakeFetch({ searches: [[/EXT_ID/, [{ ...protocol, isOpenAccess: "N" }]]] })).fetch("europepmc:MED/34815287", undefined);
    assert.ok(abstractOnly.text.startsWith(PROTOCOL_NOTE));
    const report = await createEuropePmc(fakeFetch({ searches: [[/EXT_ID/, [{ ...CARRAGEENAN, isOpenAccess: "N" }]]] })).fetch("europepmc:MED/39593091", undefined);
    assert.ok(!report.text.includes("Note:"), "a trial's own report has no note");
  });

  it("refuses IDs that are not Europe PMC's, and works it does not have", async () => {
    const europePmc = createEuropePmc(fakeFetch({}));
    await assert.rejects(europePmc.fetch("europepmc:38012345", undefined), SourceError);
    await assert.rejects(europePmc.fetch("europepmc:MED/1 OR 2", undefined), SourceError);
    await assert.rejects(europePmc.fetch("europepmc:MED/38012345", undefined), /Europe PMC has no work MED\/38012345/);
  });

  it("exports a cited work as a BibTeX article", () => {
    const answer = {
      evidence: [{ docId: "europepmc:MED/39593091#3", quote: "q" }],
      citations: {
        "europepmc:MED/39593091#3": {
          title: "Carrageenan and insulin resistance in humans",
          url: "https://europepmc.org/article/MED/39593091",
          retrievedAt: "2026-11-13T00:00:00.000Z",
          source: "Europe PMC",
          work: { authors: ["Wagner R"], year: 2024, doi: "10.1186/s12916-024-03771-8", venue: "BMC medicine" },
        },
      },
    } as unknown as SavedAnswer;
    const bib = answerToBibtex(answer)!;
    assert.match(bib, /^@article\{europepmc_MED_39593091,/);
    assert.match(bib, /journal = \{BMC medicine\}/);
  });
});
