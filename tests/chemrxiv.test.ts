import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openSourceNames, openSourcesFor, parseSourcePrefs } from "../src/app/research/sources.ts";
import { abstractText, createChemRxiv, crossrefQuery, preprintText, publishedAs, type CrossrefWork } from "../src/sources/chemrxiv.ts";
import { SourceError, type FetchLike } from "../src/sources/types.ts";

// Records shaped as Crossref's REST API gives them (its documentation, checked against the live service on
// 2026-11-20: ChemRxiv's DOIs, abstracts and "is-preprint-of" relations come in these forms).
const V2: CrossrefWork = {
  DOI: "10.26434/chemrxiv-2024-abcde-v2",
  title: ["Nickel-Catalysed Defluorinative Coupling of 2-Fluorobenzofurans"],
  author: [{ given: "Ada", family: "Kovač" }, { given: "Ben", family: "Ito" }],
  abstract: "<jats:title>Abstract</jats:title><jats:p>We report a nickel-catalysed coupling of 2-fluorobenzofurans with arylboronic acids. CO<jats:sub>2</jats:sub> is not needed.</jats:p><jats:p>Yields reach 98%.</jats:p>",
  posted: { "date-parts": [[2024, 3, 2]] },
  relation: { "is-preprint-of": [{ "id-type": "doi", id: "10.1021/JACS.4C01234" }] },
};
const V1: CrossrefWork = { ...V2, DOI: "10.26434/chemrxiv-2024-abcde", posted: { "date-parts": [[2024, 1, 15]] }, relation: {} };
const OTHER: CrossrefWork = { DOI: "10.26434/chemrxiv-2023-zzz99", title: ["Photoredox Arylation of Isonitriles"], posted: { "date-parts": [[2023, 6, 1]] } };

function crossrefFetch(answer: (url: URL) => unknown): { fetchImpl: FetchLike; urls: URL[] } {
  const urls: URL[] = [];
  const fetchImpl: FetchLike = async (url) => {
    const parsed = new URL(url);
    urls.push(parsed);
    const body = answer(parsed);
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetchImpl, urls };
}

describe("ChemRxiv through Crossref (harness 0.99.0)", () => {
  it("reads a JATS abstract as text, its paragraphs on their own lines", () => {
    assert.equal(abstractText(V2.abstract), "We report a nickel-catalysed coupling of 2-fluorobenzofurans with arylboronic acids. CO2 is not needed.\nYields reach 98%.");
    assert.equal(abstractText(undefined), "");
  });

  it("keeps a query's words", () => {
    assert.equal(crossrefQuery('nickel "2-fluorobenzofuran" coupling?'), "nickel 2-fluorobenzofuran coupling");
  });

  it("searches ChemRxiv's preprints only, and keeps the first of a preprint's versions", async () => {
    const { fetchImpl, urls } = crossrefFetch(() => ({ status: "ok", message: { items: [V2, V1, OTHER] } }));
    const hits = await createChemRxiv(fetchImpl).search("nickel fluorobenzofuran coupling");
    assert.deepEqual(hits.map((h) => h.id), ["chemrxiv:10.26434/chemrxiv-2024-abcde-v2", "chemrxiv:10.26434/chemrxiv-2023-zzz99"]);
    assert.equal(hits[0]?.title, "Nickel-Catalysed Defluorinative Coupling of 2-Fluorobenzofurans (2024)");
    assert.equal(hits[1]?.snippet, "No abstract.");
    assert.equal(urls[0]?.searchParams.get("filter"), "prefix:10.26434,type:posted-content");
    assert.equal(urls[0]?.searchParams.get("query"), "nickel fluorobenzofuran coupling");
  });

  it("looks up a DOI in the query directly", async () => {
    const { fetchImpl, urls } = crossrefFetch((url) => (url.pathname.endsWith(encodeURIComponent("10.26434/chemrxiv-2024-abcde-v2")) || url.pathname.endsWith("10.26434/chemrxiv-2024-abcde-v2") ? { status: "ok", message: V2 } : undefined));
    const hits = await createChemRxiv(fetchImpl).search("10.26434/chemrxiv-2024-abcde-v2");
    assert.equal(hits.length, 1);
    assert.equal(urls.length, 1);
  });

  it("reads a preprint as its record and abstract, with the journal version and a reference", async () => {
    const { fetchImpl } = crossrefFetch(() => ({ status: "ok", message: V2 }));
    const doc = await createChemRxiv(fetchImpl).fetch("chemrxiv:10.26434/chemrxiv-2024-abcde-v2");
    assert.equal(doc.url, "https://doi.org/10.26434/chemrxiv-2024-abcde-v2");
    assert.deepEqual(doc.work, { authors: ["Ada Kovač", "Ben Ito"], year: 2024, doi: "10.26434/chemrxiv-2024-abcde-v2", venue: "ChemRxiv" });
    assert.equal(publishedAs(V2), "10.1021/jacs.4c01234");
    assert.equal(
      preprintText(V2),
      [
        "Nickel-Catalysed Defluorinative Coupling of 2-Fluorobenzofurans",
        "Ada Kovač, Ben Ito. 2024. ChemRxiv preprint",
        "DOI: 10.26434/chemrxiv-2024-abcde-v2",
        "Published in a journal as DOI 10.1021/jacs.4c01234.",
        "Abstract: We report a nickel-catalysed coupling of 2-fluorobenzofurans with arylboronic acids. CO2 is not needed.\nYields reach 98%.",
        "(This is the preprint's record from Crossref; its full text is on chemrxiv.org, which was not read.)",
      ].join("\n"),
    );
  });

  it("refuses an ID that is not a ChemRxiv DOI, and says when Crossref has none", async () => {
    const chemrxiv = createChemRxiv(crossrefFetch(() => undefined).fetchImpl);
    await assert.rejects(chemrxiv.fetch("chemrxiv:10.1021/jacs.4c01234"), SourceError);
    await assert.rejects(chemrxiv.fetch("chemrxiv:10.26434/chemrxiv-2099-nope"), /Crossref has no work with DOI/);
  });

  it("is offered when ticked", () => {
    const prefs = parseSourcePrefs(JSON.stringify({ chemrxiv: true, pubchem: true }));
    assert.deepEqual(openSourceNames(prefs), ["PubChem", "ChemRxiv"]);
    assert.deepEqual(openSourcesFor(prefs).map((s) => s.name), ["pubchem", "chemrxiv"]);
  });
});
