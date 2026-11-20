import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anyOpenSource, openSourceNames, openSourcesFor, parseSourcePrefs } from "../src/app/research/sources.ts";
import { closeSpelling, compoundText, createPubChem, experimentalText, isCasNumber, isDatabaseId, namesIn, type PubChemProperties, type PugViewRecord } from "../src/sources/pubchem.ts";
import { SourceError, type FetchLike } from "../src/sources/types.ts";

// Answers shaped as PubChem's PUG REST and PUG View give them, cut down (checked against the live service on
// 2026-11-20: THF's properties, SMILES included, and PUG View's experimental properties come in these forms).
const THF: PubChemProperties = {
  CID: 8028,
  Title: "Tetrahydrofuran",
  MolecularFormula: "C4H8O",
  MolecularWeight: "72.11",
  ExactMass: "72.057514874",
  IUPACName: "oxolane",
  InChI: "InChI=1S/C4H8O/c1-2-4-5-3-1/h1-4H2",
  InChIKey: "WYURNTSHIVDZCO-UHFFFAOYSA-N",
  SMILES: "C1CCOC1",
  XLogP: 0.5,
};

const VIEW: PugViewRecord = {
  Record: {
    RecordNumber: 8028,
    RecordTitle: "Tetrahydrofuran",
    Section: [
      {
        TOCHeading: "Chemical and Physical Properties",
        Section: [
          {
            TOCHeading: "Experimental Properties",
            Section: [
              {
                TOCHeading: "Boiling Point",
                Information: [
                  { ReferenceNumber: 1, Value: { StringWithMarkup: [{ String: "66 °C" }] } },
                  { ReferenceNumber: 2, Value: { StringWithMarkup: [{ String: "66 °C" }] } },
                  { ReferenceNumber: 2, Value: { Number: [65], Unit: "°C" } },
                ],
              },
              { TOCHeading: "Density", Information: [{ ReferenceNumber: 1, Value: { StringWithMarkup: [{ String: "0.8892 g/cu cm at 20 °C" }] } }] },
              { TOCHeading: "Odor", Information: [] },
            ],
          },
        ],
      },
    ],
    Reference: [
      { ReferenceNumber: 1, SourceName: "Hazardous Substances Data Bank (HSDB)" },
      { ReferenceNumber: 2, SourceName: "ILO-WHO International Chemical Safety Cards (ICSCs)" },
    ],
  },
};

/** A fetch answering PubChem's URLs from a table, by the path after the host; 404 for anything else. */
function pubchemFetch(answers: Record<string, unknown>): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    const path = decodeURIComponent(url.replace("https://pubchem.ncbi.nlm.nih.gov/rest/", ""));
    const key = Object.keys(answers).find((k) => path === k || path.startsWith(`${k}?`));
    if (key === undefined) return { ok: false, status: 404, json: async () => ({ Fault: { Code: "PUGREST.NotFound" } }) };
    const answer = answers[key];
    if (typeof answer === "number") return { ok: false, status: answer, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => answer };
  };
  return { fetchImpl, urls };
}

describe("PubChem (harness 0.99.0)", () => {
  it("tells a CAS number by its check digit", () => {
    assert.equal(isCasNumber("109-99-9"), true);
    assert.equal(isCasNumber("7732-18-5"), true);
    assert.equal(isCasNumber("109-99-8"), false);
    assert.equal(isCasNumber("2024-07-1"), false);
  });

  it("reads a question for the compound it names", () => {
    assert.deepEqual(namesIn("tetrahydrofuran"), ["tetrahydrofuran"]);
    assert.deepEqual(namesIn("What is the boiling point of sodium borohydride?"), ["What is the boiling point of sodium borohydride", "sodium borohydride"]);
    assert.deepEqual(namesIn("density of 109-99-9"), ["density of 109-99-9", "109-99-9"]);
    assert.deepEqual(namesIn("WYURNTSHIVDZCO-UHFFFAOYSA-N"), ["WYURNTSHIVDZCO-UHFFFAOYSA-N"]);
  });

  it("finds a compound by its name, and by the name in a question", async () => {
    const { fetchImpl, urls } = pubchemFetch({
      "pug/compound/name/tetrahydrofuran/cids/JSON": { IdentifierList: { CID: [8028] } },
      "pug/compound/cid/8028/property/Title,MolecularFormula,MolecularWeight,IUPACName/JSON": { PropertyTable: { Properties: [THF] } },
    });
    const pubchem = createPubChem(fetchImpl);
    assert.deepEqual(await pubchem.search("tetrahydrofuran"), [{ id: "pubchem:8028", title: "Tetrahydrofuran", snippet: "C4H8O, 72.11 g/mol; IUPAC name: oxolane" }]);
    const hits = await pubchem.search("boiling point of tetrahydrofuran");
    assert.equal(hits[0]?.id, "pubchem:8028");
    // The question as written is tried first, and PubChem knows no such name.
    assert.ok(urls.some((u) => u.includes("/name/boiling%20point%20of%20tetrahydrofuran/cids")));
  });

  it("falls back on PubChem's suggestions for a name written another way", async () => {
    const { fetchImpl } = pubchemFetch({
      "autocomplete/compound/tetrahydrofurane/json": { total: 1, dictionary_terms: { compound: ["tetrahydrofuran"] } },
      "pug/compound/name/tetrahydrofuran/cids/JSON": { IdentifierList: { CID: [8028] } },
      "pug/compound/cid/8028/property/Title,MolecularFormula,MolecularWeight,IUPACName/JSON": { PropertyTable: { Properties: [THF] } },
    });
    const hits = await createPubChem(fetchImpl).search("tetrahydrofurane");
    assert.equal(hits[0]?.id, "pubchem:8028");
  });

  it("takes a suggestion only when it is spelled close to what was typed", async () => {
    assert.equal(closeSpelling("tetrahydrofuran", "tetrahydrofurane"), true);
    assert.equal(closeSpelling("Tetrahydrofuran", "tetra-hydrofuran"), true);
    // Checked live: PubChem's autocomplete suggested "Carcainium" for "unobtainium".
    assert.equal(closeSpelling("Carcainium", "unobtainium"), false);
    const { fetchImpl } = pubchemFetch({ "autocomplete/compound/unobtainium/json": { total: 1, dictionary_terms: { compound: ["Carcainium"] } } });
    assert.deepEqual(await createPubChem(fetchImpl).search("unobtainium"), []);
  });

  it("leaves other databases' identifiers out of a compound's names", () => {
    for (const id of ["DTXSID80893977", "EC 241-004-4", "NCI-C60560", "CHEBI:50985", "RefChem:183807", "241-004-4", "87L0B9CPPA", "SCHEMBL12345", "MFCD00005132"]) assert.equal(isDatabaseId(id), true, id);
    for (const name of ["NaBH4", "Sodium tetrahydridoborate(1-)", "Borate(1-), tetrahydro-, sodium", "THF", "Tetramethylene oxide"]) assert.equal(isDatabaseId(name), false, name);
    const text = compoundText({ CID: 4311764, Title: "Sodium borohydride" }, { synonyms: ["Sodium borohydride", "16940-66-2", "NaBH4", "DTXSID80893977", "CHEBI:50985", "Sodium tetrahydridoborate(1-)"] });
    assert.ok(text.includes("Other names: NaBH4; Sodium tetrahydridoborate(1-)\n"));
  });

  it("gives no results for a name PubChem does not know", async () => {
    const { fetchImpl } = pubchemFetch({});
    assert.deepEqual(await createPubChem(fetchImpl).search("unobtainium"), []);
  });

  it("writes experimental properties with their sources, each value once", () => {
    assert.equal(
      experimentalText(VIEW),
      [
        "### Boiling Point",
        "- 66 °C (Hazardous Substances Data Bank (HSDB))",
        "- 65 °C (ILO-WHO International Chemical Safety Cards (ICSCs))",
        "### Density",
        "- 0.8892 g/cu cm at 20 °C (Hazardous Substances Data Bank (HSDB))",
      ].join("\n"),
    );
  });

  it("reads a compound: computed properties, CAS numbers among its synonyms, descriptions and measured properties", async () => {
    const { fetchImpl } = pubchemFetch({
      [`pug/compound/cid/8028/property/Title,MolecularFormula,MolecularWeight,ExactMass,IUPACName,InChI,InChIKey,SMILES,XLogP,Charge/JSON`]: { PropertyTable: { Properties: [THF] } },
      "pug/compound/cid/8028/synonyms/JSON": { InformationList: { Information: [{ CID: 8028, Synonym: ["Tetrahydrofuran", "oxolane", "THF", "109-99-9", "Tetramethylene oxide"] }] } },
      "pug/compound/cid/8028/description/JSON": {
        InformationList: { Information: [{ CID: 8028, Title: "Tetrahydrofuran" }, { CID: 8028, Description: "Tetrahydrofuran is a cyclic ether used as a solvent.", DescriptionSourceName: "ChEBI" }] },
      },
      "pug_view/data/compound/8028/JSON": VIEW,
    });
    const doc = await createPubChem(fetchImpl).fetch("pubchem:8028");
    assert.equal(doc.title, "Tetrahydrofuran");
    assert.equal(doc.url, "https://pubchem.ncbi.nlm.nih.gov/compound/8028");
    for (const line of [
      "# Tetrahydrofuran (PubChem CID 8028)",
      "IUPAC name: oxolane",
      "Molecular formula: C4H8O",
      "Molecular weight: 72.11 g/mol",
      "CAS number: 109-99-9",
      "Other names: oxolane; THF; Tetramethylene oxide",
      "SMILES: C1CCOC1",
      "Tetrahydrofuran is a cyclic ether used as a solvent. (ChEBI)",
      "- 66 °C (Hazardous Substances Data Bank (HSDB))",
    ]) assert.ok(doc.text.includes(line), line);
  });

  it("leaves out a part PubChem does not give, and says so", async () => {
    const { fetchImpl } = pubchemFetch({
      [`pug/compound/cid/8028/property/Title,MolecularFormula,MolecularWeight,ExactMass,IUPACName,InChI,InChIKey,SMILES,XLogP,Charge/JSON`]: { PropertyTable: { Properties: [THF] } },
      "pug/compound/cid/8028/synonyms/JSON": 503,
    });
    const doc = await createPubChem(fetchImpl).fetch("pubchem:8028");
    assert.ok(doc.text.includes("(PubChem did not give this compound's synonyms, so they are left out.)"));
    // No description and no experimental properties (404): nothing to say.
    assert.ok(!doc.text.includes("## Description"));
    assert.ok(!doc.text.includes("descriptions, so"));
  });

  it("asks again without SMILES when PubChem refuses a property's name", async () => {
    const { fetchImpl } = pubchemFetch({
      [`pug/compound/cid/8028/property/Title,MolecularFormula,MolecularWeight,ExactMass,IUPACName,InChI,InChIKey,SMILES,XLogP,Charge/JSON`]: 400,
      [`pug/compound/cid/8028/property/Title,MolecularFormula,MolecularWeight,IUPACName,ExactMass,InChI,InChIKey,XLogP,Charge/JSON`]: { PropertyTable: { Properties: [{ ...THF, SMILES: undefined, IsomericSMILES: "C1CCOC1" }] } },
    });
    const doc = await createPubChem(fetchImpl).fetch("pubchem:8028");
    assert.ok(doc.text.includes("SMILES: C1CCOC1"));
  });

  it("refuses an ID that is not a compound's", async () => {
    await assert.rejects(createPubChem(pubchemFetch({}).fetchImpl).fetch("pubchem:abc"), SourceError);
  });

  it("says which values PubChem computed", () => {
    assert.ok(compoundText(THF, {}).includes("(The formula, weights, XLogP3 and identifiers are computed by PubChem from the structure.)"));
  });

  it("is offered when ticked, and tells the model what to query", () => {
    const prefs = parseSourcePrefs(JSON.stringify({ pubchem: true }));
    assert.equal(prefs.pubchem, true);
    assert.equal(anyOpenSource(prefs), true);
    assert.deepEqual(openSourceNames(prefs), ["PubChem"]);
    const [source] = openSourcesFor(prefs);
    assert.equal(source?.name, "pubchem");
    assert.match(source?.searchHint ?? "", /compound's name, CAS number or InChIKey/);
    assert.equal(parseSourcePrefs(JSON.stringify({ pubchem: "yes" })).pubchem, undefined);
  });
});
