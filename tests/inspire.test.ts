import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openSourceNames, openSourcesFor, parseSourcePrefs, anyOpenSource } from "../src/app/research/sources.ts";
import { createInspire, inspireCitationQuery, inspireWords, inspireWorkInfo, journalRef, READ_FIELDS, recordText, wordTries, type InspireRecord } from "../src/sources/inspire.ts";
import { SourceSession } from "../src/sources/session.ts";
import { SourceError, type FetchedDocument, type FetchLike, type OpenSource } from "../src/sources/types.ts";

/** ATLAS's Higgs discovery, as INSPIRE's search returns it with the read fields (checked live, 2026-11-19; authors cut). */
const HIGGS: InspireRecord = {
  control_number: 1124337,
  titles: [{ title: "Observation of a new particle in the search for the Standard Model Higgs boson with the ATLAS detector at the LHC" }],
  abstracts: [
    { source: "Elsevier", value: "Publisher's abstract." },
    { source: "arXiv", value: "A search for the Standard Model Higgs boson in proton-proton collisions with the ATLAS detector at the LHC is presented. An excess of events is observed with a significance of 5.9 standard deviations." },
  ],
  authors: [{ full_name: "Aad, Georges" }, { full_name: "Abajyan, Tatevik" }],
  author_count: 2932,
  collaborations: [{ value: "ATLAS" }],
  arxiv_eprints: [{ value: "1207.7214", categories: ["hep-ex"] }],
  dois: [{ value: "10.1016/j.physletb.2012.08.020" }],
  publication_info: [{ journal_title: "Phys.Lett.B", journal_volume: "716", year: 2012, page_start: "1", page_end: "29" }],
  citation_count: 17837,
  citation_count_without_self_citations: 14196,
  earliest_date: "2012-07",
  document_type: ["article"],
  texkeys: ["ATLAS:2012yve", "Aad:2012tfa"],
  report_numbers: [{ value: "CERN-PH-EP-2012-218" }],
  references: [{}, {}, {}],
};
/** A small-author paper with no journal reference: Higgs's 1964 letter, as cited. */
const BROKEN: InspireRecord = {
  control_number: 11883,
  titles: [{ title: "Broken Symmetries and the Masses of Gauge Bosons" }],
  authors: [{ full_name: "Higgs, Peter W." }],
  author_count: 1,
  earliest_date: "1964-10",
  citation_count: 9146,
};

/** A fetch that answers INSPIRE's search by the query, and records every URL asked for. */
function inspireFetch(answer: (q: string, params: URLSearchParams) => InspireRecord[]): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    const params = new URL(url).searchParams;
    const hits = answer(params.get("q") ?? "", params).map((metadata) => ({ metadata }));
    return { ok: true, status: 200, json: async () => ({ hits: { total: hits.length, hits } }) };
  };
  return { fetchImpl, urls };
}

describe("INSPIRE-HEP queries (harness 0.92.0)", () => {
  it("keeps a query's content words, without INSPIRE's operators, field names and syntax", () => {
    // "a …" would be an author search, "and"/"or"/"not" operators, ":" "/" and quotes syntax.
    assert.deepEqual(inspireWords("a search for dark photons"), ["search", "dark", "photons"]);
    assert.deepEqual(inspireWords("What is the W boson mass measured by CDF?"), ["W", "boson", "mass", "CDF"]);
    assert.deepEqual(inspireWords('muon g-2 at 0.20 ppm and "J/psi" (139 fb-1) -excluded'), ["muon", "g-2", "0.20", "ppm", "J", "psi", "139", "fb-1", "excluded"]);
  });

  it("tries all the words, then without plain numbers, then the first three", () => {
    assert.deepEqual(wordTries(["muon", "anomalous", "moment", "Fermilab", "0.20", "ppm"]), [
      ["muon", "anomalous", "moment", "Fermilab", "0.20", "ppm"],
      ["muon", "anomalous", "moment", "Fermilab", "ppm"],
      ["muon", "anomalous", "moment"],
    ]);
    assert.deepEqual(wordTries(["muon", "g-2"]), [["muon", "g-2"]], "a name with digits is kept");
    assert.deepEqual(wordTries(["GW170817", "kilonova", "1.7", "s"]), [["GW170817", "kilonova", "1.7", "s"], ["GW170817", "kilonova", "s"], ["GW170817", "kilonova", "1.7"]]);
  });

  it("reads citation searches by record, arXiv ID, DOI or title, and INSPIRE's own forms", () => {
    assert.deepEqual(inspireCitationQuery("citing inspire:1124337: dark matter"), { direction: "citing", work: "recid:1124337", terms: "dark matter" });
    assert.deepEqual(inspireCitationQuery("references of inspire:1124337"), { direction: "references", work: "recid:1124337", terms: "" });
    assert.deepEqual(inspireCitationQuery("refersto:recid:1124337 and axion"), { direction: "citing", work: "recid:1124337", terms: "axion" });
    assert.deepEqual(inspireCitationQuery("citedby:recid:1124337"), { direction: "references", work: "recid:1124337", terms: "" });
    assert.equal(inspireCitationQuery("citing arxiv:1207.7214")?.work, "arxiv:1207.7214");
    assert.equal(inspireCitationQuery("references of doi:10.1016/j.physletb.2012.08.020")?.work, "doi:10.1016/j.physletb.2012.08.020");
    assert.equal(inspireCitationQuery("references of Observation of a new particle: Higgs")?.work, "title:Observation of a new particle");
    assert.equal(inspireCitationQuery("W boson mass CDF"), undefined);
    assert.throws(() => inspireCitationQuery("citing W2741809807"), SourceError);
  });
});

describe("INSPIRE-HEP records (harness 0.92.0)", () => {
  it("writes a record with its journal reference, identifiers, TeX key, citations and arXiv abstract", () => {
    const text = recordText(HIGGS);
    assert.equal(journalRef(HIGGS), "Phys.Lett.B 716 (2012) 1-29");
    assert.match(text, /^Observation of a new particle .* at the LHC\nATLAS Collaboration \(2,932 authors\)\. 2012\n/);
    assert.match(text, /\nJournal: Phys\.Lett\.B 716 \(2012\) 1-29\nDOI: 10\.1016\/j\.physletb\.2012\.08\.020\narXiv: 1207\.7214\nReport numbers: CERN-PH-EP-2012-218\nINSPIRE TeX key: ATLAS:2012yve\n/);
    assert.match(text, /\nCited by 17,837 records in INSPIRE \(14,196 without self-citations\); its references linked there: 3\.\n/);
    assert.match(text, /\nAbstract: A search for the Standard Model Higgs boson/, "the arXiv abstract, as the authors wrote it");
    assert.match(recordText(BROKEN), /^Broken Symmetries and the Masses of Gauge Bosons\nHiggs, Peter W\.\. 1964\nCited by 9,146 records in INSPIRE\.\nINSPIRE has no abstract for this record\.$/);
  });

  it("reads MathML in a title and JATS XML in a publisher's abstract as their text", () => {
    const cdf: InspireRecord = {
      control_number: 2064224,
      titles: [{ title: 'High-precision measurement of the <math display="inline"><mi>W</mi></math> boson mass with the CDF II detector' }],
      abstracts: [{ source: "AAAS", value: "<jats:p>\n  We measure the\n  <jats:italic>W</jats:italic>\n  boson mass &amp; more.</jats:p>" }],
    };
    assert.match(recordText(cdf), /^High-precision measurement of the W boson mass with the CDF II detector\n[\s\S]*Abstract: We measure the W boson mass & more\.$/);
  });

  it("cites a collaboration's paper by its collaboration, and keeps the TeX key", () => {
    assert.deepEqual(inspireWorkInfo(HIGGS), { authors: ["ATLAS Collaboration"], year: 2012, doi: "10.1016/j.physletb.2012.08.020", venue: "Phys.Lett.B", texkey: "ATLAS:2012yve" });
    assert.deepEqual(inspireWorkInfo(BROKEN), { authors: ["Higgs, Peter W."], year: 1964 });
  });
});

describe("INSPIRE-HEP source (harness 0.92.0)", () => {
  it("searches titles first, then titles, abstracts and authors, most cited first, without the authors' names", async () => {
    const { fetchImpl, urls } = inspireFetch((q) => (q.startsWith("title:(W boson mass CDF)") && !q.includes(" or ") ? [HIGGS] : q.includes(" or ") ? [HIGGS, BROKEN] : []));
    const hits = await createInspire(fetchImpl).search("What is the W boson mass measured by CDF?");
    const params = urls.map((u) => new URL(u).searchParams);
    assert.deepEqual(
      params.map((p) => p.get("q")),
      ["title:(W boson mass CDF)", "title:(W boson mass CDF) or abstracts.value:(W boson mass CDF) or authors.full_name:(W boson mass CDF)"],
    );
    assert.ok(params.every((p) => p.get("sort") === "mostcited" && !p.get("fields")!.includes("authors")));
    assert.deepEqual(
      hits.map((h) => [h.id, h.title]),
      [
        ["inspire:1124337", "Observation of a new particle in the search for the Standard Model Higgs boson with the ATLAS detector at the LHC (2012, ATLAS Collaboration, cited by 17,837)"],
        ["inspire:11883", "Broken Symmetries and the Masses of Gauge Bosons (1964, cited by 9,146)"],
      ],
    );
    assert.match(hits[0]!.snippet, /^A search for the Standard Model Higgs boson/);
  });

  it("drops plain numbers, then all but three words, when a query finds nothing", async () => {
    const { fetchImpl, urls } = inspireFetch((q) => (q.includes("(muon anomalous moment)") ? [HIGGS] : []));
    const hits = await createInspire(fetchImpl).search("muon anomalous moment Fermilab 0.20 ppm");
    assert.equal(hits.length, 1);
    assert.deepEqual(
      urls.map((u) => new URL(u).searchParams.get("q")!.replace(/ or .*/, "")),
      ["title:(muon anomalous moment Fermilab 0.20 ppm)", "title:(muon anomalous moment Fermilab 0.20 ppm)", "title:(muon anomalous moment Fermilab ppm)", "title:(muon anomalous moment Fermilab ppm)", "title:(muon anomalous moment)", "title:(muon anomalous moment)"],
    );
  });

  it("follows citations: a paper named by its arXiv ID is looked up, then its citing records searched", async () => {
    const { fetchImpl, urls } = inspireFetch((q) => (q === "arxiv:1207.7214" ? [HIGGS] : q.startsWith("refersto:recid:1124337") ? [BROKEN] : []));
    const hits = await createInspire(fetchImpl).search("citing arxiv:1207.7214: dark matter");
    assert.deepEqual(hits.map((h) => h.id), ["inspire:11883"]);
    assert.deepEqual(urls.map((u) => new URL(u).searchParams.get("q")), [
      "arxiv:1207.7214",
      "refersto:recid:1124337 and (title:(dark matter))",
      "refersto:recid:1124337 and (title:(dark matter) or abstracts.value:(dark matter) or authors.full_name:(dark matter))",
    ]);
  });

  it("searches a reference list by title, abstract and author at once, and lists it all when the words match none", async () => {
    const { fetchImpl, urls } = inspireFetch((q) => (q === "citedby:recid:1124337" ? [BROKEN, HIGGS] : q === "citedby:recid:1124337 and (title:(Higgs) or abstracts.value:(Higgs) or authors.full_name:(Higgs))" ? [BROKEN] : []));
    const source = createInspire(fetchImpl);
    assert.deepEqual((await source.search("references of inspire:1124337: Higgs")).map((h) => h.id), ["inspire:11883"]);
    assert.deepEqual((await source.search("references of inspire:1124337: zebrafish")).map((h) => h.id), ["inspire:11883", "inspire:1124337"]);
    assert.ok(urls.every((u) => !/citedby:recid:1124337 and \(title:\([^)]*\)\)$/.test(new URL(u).searchParams.get("q")!)), "no title-only search within a reference list");
  });

  it("says when a paper named for its citations is not in INSPIRE", async () => {
    const { fetchImpl } = inspireFetch(() => []);
    await assert.rejects(createInspire(fetchImpl).search("citing arxiv:9999.99999"), /INSPIRE has no record for arXiv paper 9999\.99999/);
  });

  it("reads a record through the search, which honours the fields, as its abstract", async () => {
    const { fetchImpl, urls } = inspireFetch((q) => (q === "recid:1124337" ? [HIGGS] : []));
    const doc = await createInspire(fetchImpl).fetch("inspire:1124337");
    const params = new URL(urls[0]!).searchParams;
    assert.equal(params.get("fields"), READ_FIELDS);
    assert.equal(new URL(urls[0]!).pathname, "/api/literature");
    assert.equal(doc.id, "inspire:1124337");
    assert.equal(doc.url, "https://inspirehep.net/literature/1124337");
    assert.match(doc.text, /INSPIRE TeX key: ATLAS:2012yve[\s\S]*Abstract: /);
    assert.equal(doc.work?.texkey, "ATLAS:2012yve");
    await assert.rejects(createInspire(fetchImpl).fetch("inspire:abc"), /not an INSPIRE record ID/);
  });

  it("reads a record in full from arXiv when arXiv is ticked, under its INSPIRE ID, with INSPIRE's details first", async () => {
    const { fetchImpl } = inspireFetch(() => [HIGGS]);
    const asked: string[] = [];
    const arxiv: OpenSource = {
      name: "arxiv",
      label: "arXiv",
      search: async () => [],
      fetch: async (id): Promise<FetchedDocument> => {
        asked.push(id);
        return { id, title: "x", text: "1 Introduction\nThe full paper.", url: "https://arxiv.org/abs/1207.7214", retrievedAt: "2026-11-19T00:00:00Z", pageStarts: [0, 15], work: { authors: [], doi: "10.48550/arXiv.1207.7214" } };
      },
    };
    const doc = await createInspire(fetchImpl, { arxiv }).fetch("inspire:1124337");
    assert.deepEqual(asked, ["arxiv:1207.7214"]);
    assert.equal(doc.id, "inspire:1124337");
    assert.match(doc.text, /^Observation of a new particle[\s\S]*Journal: Phys\.Lett\.B 716[\s\S]*Full text, read from arXiv:\n\n1 Introduction\nThe full paper\.$/);
    assert.doesNotMatch(doc.text, /Abstract:/);
    const head = doc.text.indexOf("1 Introduction");
    assert.deepEqual(doc.pageStarts, [head, head + 15]);
    assert.equal(doc.work?.doi, "10.1016/j.physletb.2012.08.020", "the published version's DOI");
    // Without arXiv ticked, or when arXiv fails, the abstract.
    const failing: OpenSource = { ...arxiv, fetch: async () => Promise.reject(new SourceError("arXiv could not be reached.")) };
    assert.match((await createInspire(fetchImpl, { arxiv: failing }).fetch("inspire:1124337")).text, /Abstract: A search/);
  });

  it("points the model to INSPIRE's citation forms after a record's first read, when told it can follow them", async () => {
    const { fetchImpl } = inspireFetch(() => [HIGGS]);
    const session = new SourceSession([createInspire(fetchImpl, {}, { followCitations: true })], "Who discovered it?");
    const first = await session.read("inspire:1124337");
    assert.match(first, /\[To follow its citations, search_inspire "citing inspire:1124337" for records citing it, or "references of inspire:1124337" for records it cites/);
    assert.doesNotMatch(await session.read("inspire:1124337"), /To follow its citations/, "once");
    const quiet = new SourceSession([createInspire(fetchImpl)], "Who discovered it?");
    assert.doesNotMatch(await quiet.read("inspire:1124337"), /To follow its citations/);
  });
});

describe("INSPIRE-HEP in the app (harness 0.92.0)", () => {
  it("is off by default, kept when ticked, and reads from arXiv only when arXiv is ticked too", () => {
    assert.equal(parseSourcePrefs(null).inspire, undefined);
    const prefs = parseSourcePrefs(JSON.stringify({ inspire: true, inspireFollowCitations: true }));
    assert.equal(prefs.inspire, true);
    assert.equal(prefs.inspireFollowCitations, true);
    assert.equal(parseSourcePrefs(JSON.stringify({ inspire: "yes" })).inspire, undefined);
    assert.equal(anyOpenSource(prefs), true);
    assert.deepEqual(openSourceNames(prefs), ["INSPIRE-HEP"]);
    const sources = openSourcesFor(prefs);
    assert.deepEqual(sources.map((s) => [s.name, s.label, s.followsCitations ?? false]), [["inspire", "INSPIRE-HEP", true]]);
  });
});
