import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResearchLibrary } from "../src/agent/research.ts";
import { loadFieldSuite } from "../eval/harness/field.ts";
import { loadNodePdfLibrary } from "../eval/harness/pdf-node.ts";
import { appSearch, measureRetrieval, summarizeRetrieval } from "../eval/harness/retrieval.ts";
import { DISTRACTOR_PREFIX, distractorDocuments } from "../eval/harness/distractors.ts";
import { baseLibrary } from "../eval/harness/suites.ts";
import { csHoldoutTasks, csTasks } from "../eval/cs/tasks.ts";
import { labHoldoutTasks, labTasks } from "../eval/lab/tasks.ts";
import { chemHoldoutTasks, chemTasks } from "../eval/chem/tasks.ts";
import { materialsHoldoutTasks, materialsTasks } from "../eval/materials/tasks.ts";
import { pdfTasks } from "../eval/tasks/pdf.ts";
import { researchTasks, type ResearchTask } from "../eval/tasks/research.ts";

const task = (id: string, question: string, citations: string[][], facts: string[][]): ResearchTask => ({
  id,
  kind: "lookup",
  question,
  answerable: true,
  facts,
  citations,
});

describe("retrieval measure", () => {
  const library = new ResearchLibrary([
    { id: "pages", title: "Storage notes", text: "The default page size is 4 KiB." },
    { id: "history", title: "Project history", text: "The project started in 2019 at Harrow Labs." },
    { id: "fuji", title: "富士山", text: "富士山の標高は3776.12 mである。" },
  ]);

  it("counts cited documents among the results, and facts in the results' own text", () => {
    const [found, missed] = measureRetrieval(library, [
      task("t1", "What is the default page size?", [["pages"]], [["4 KiB"]]),
      task("t2", "What is the default page size, and when did the project start?", [["pages"], ["history"]], [["4 KiB"], ["2020"]]),
    ]);
    assert.deepEqual(found!.documents, { found: 1, wanted: 1 });
    assert.deepEqual(found!.passages, { found: 1, wanted: 1 });
    assert.deepEqual(missed!.documents, { found: 2, wanted: 2 });
    assert.deepEqual(missed!.passages, { found: 1, wanted: 2 }, "2020 is in no result");
    assert.deepEqual(summarizeRetrieval([found!, missed!]), { tasks: 2, acrossScripts: 0, documentRecall: 1, passageRecall: 0.667, complete: 1 });
  });

  it("leaves out unanswerable tasks, and counts questions in another writing system apart", () => {
    const results = measureRetrieval(library, [
      { ...task("u1", "Who is the CEO?", [], []), answerable: false },
      task("x1", "How high is Mount Fuji?", [["fuji"]], [["3776.12"]]),
    ]);
    assert.deepEqual(
      results.map((r) => [r.taskId, r.acrossScripts]),
      [["x1", true]],
    );
    assert.equal(summarizeRetrieval(results).acrossScripts, 1);
  });

  it("does not count an answer's spelling in a generated document as its passage", () => {
    const withDistractor = new ResearchLibrary([
      { id: "pages", title: "Storage notes", text: "The default page size is 4 KiB." },
      { id: `${DISTRACTOR_PREFIX}1`, title: "Other notes", text: "The default page size is 8 KiB, and the cache page size is 4 KiB." },
    ]);
    const [result] = measureRetrieval(withDistractor, [task("t4", "What is the cache page size?", [["pages"]], [["8 KiB"]])]);
    assert.deepEqual(result!.passages, { found: 0, wanted: 1 });
  });

  it("measures more results when asked", () => {
    const [few] = measureRetrieval(library, [task("t3", "page size project", [["history"]], [])], appSearch(1));
    const [more] = measureRetrieval(library, [task("t3", "page size project", [["history"]], [])], appSearch(3));
    assert.deepEqual([few!.documents.found, more!.documents.found], [0, 1]);
  });
});

// Floors for the app's search, so a change to search or chunking that finds less shows in the tests.
// Raise them when search improves (npm run bench:retrieval prints the figures).
describe("retrieval on the evaluation set", () => {
  it("finds every cited document and answer passage in the research and pdf suites", async () => {
    for (const [library, tasks] of [
      [baseLibrary, researchTasks],
      [await loadNodePdfLibrary(), pdfTasks],
    ] as const) {
      const summary = summarizeRetrieval(measureRetrieval(library, tasks));
      assert.equal(summary.complete, summary.tasks);
    }
  });

  it("keeps the field suite's retrieval at least where it is", async () => {
    const field = await loadFieldSuite();
    const summary = summarizeRetrieval(measureRetrieval(field.library, field.tasks));
    assert.ok(summary.documentRecall >= FIELD_FLOOR.documentRecall, `cited documents: ${summary.documentRecall}`);
    assert.ok(summary.passageRecall >= FIELD_FLOOR.passageRecall, `answer passages: ${summary.passageRecall}`);
    assert.ok(summary.complete >= FIELD_FLOOR.complete, `complete: ${summary.complete}`);
  });

  it("keeps the CS papers' retrieval at least where it is", async () => {
    // Since 0.73.0 the acronym questions (cs11, cs22) find their passages: eval/cs/README.md.
    const field = await loadFieldSuite();
    const summary = summarizeRetrieval(measureRetrieval(field.csLibrary, [...csTasks, ...csHoldoutTasks]));
    assert.ok(summary.documentRecall >= CS_FLOOR.documentRecall, `cited documents: ${summary.documentRecall}`);
    assert.ok(summary.passageRecall >= CS_FLOOR.passageRecall, `answer passages: ${summary.passageRecall}`);
    assert.ok(summary.complete >= CS_FLOOR.complete, `complete: ${summary.complete}`);
  });

  it("keeps the laboratory papers' retrieval at least where it is", async () => {
    // Search does well here: the questions use the papers' own terms, except the alias questions, whose
    // other words find the paper (eval/lab/README.md). l28, over two papers, is the one miss.
    const field = await loadFieldSuite();
    const summary = summarizeRetrieval(measureRetrieval(field.labLibrary, [...labTasks, ...labHoldoutTasks]));
    assert.ok(summary.documentRecall >= LAB_FLOOR.documentRecall, `cited documents: ${summary.documentRecall}`);
    assert.ok(summary.passageRecall >= LAB_FLOOR.passageRecall, `answer passages: ${summary.passageRecall}`);
    assert.ok(summary.complete >= LAB_FLOOR.complete, `complete: ${summary.complete}`);
  });

  it("finds the IL10 paper for a researcher's own spelling of its name", async () => {
    // The alias gap, measured: the paper writes "IL10", so "IL-10" matches it nowhere, and the three
    // papers search returns instead are about a kinase inhibitor, an antibiotic and an enzyme. A
    // question carries the name's own words with it, which is why the suite's alias tasks still
    // retrieve; a change that matches gene names however they are written should make this test fail.
    const field = await loadFieldSuite();
    const found = (query: string) => new Set(appSearch(3)(field.labLibrary, query).map((id) => id.replace(/#\d+$/, "")));
    assert.ok(found("IL10").has("il10-tolerance-birds"), "the paper's own spelling finds it");
    // Until 0.85.0 a hyphen between the letters and the number missed it, and the three papers search
    // returned instead were about a kinase inhibitor, an antibiotic and an enzyme (eval/lab/README.md).
    assert.ok(found("IL-10").has("il10-tolerance-birds"), "and so does a hyphen between the letters and the number");
  });

  it("finds a paper by another spelling of a name (harness 0.87.0)", async () => {
    // Measured at 0.76.0 before building anything: every paper was found by the spelling it uses, and 8
    // of 28 spellings a researcher might type were not, in two families — a hyphen or space inside a
    // name, and a Greek letter written as its name. 0.85.0 bridges both, on the query side, and 26 of 28
    // now find their paper; the two that do not are a Latin letter standing for a Greek one ("Ppara")
    // and a name's substring ("MDH2" for "BmMDH2"), neither a spelling of the same name
    // (eval/lab/README.md).
    const field = await loadFieldSuite();
    const found = (query: string) => new Set(appSearch(3)(field.labLibrary, query).map((id) => id.replace(/#\d+$/, "")));
    for (const [own, paper] of [
      ["IL10", "il10-tolerance-birds"],
      ["PPARα", "ppara-brown-adipocytes"],
      ["mecA", "meca-daptomycin-tolerance"],
      ["H3K27me3", "scml2-sperm-chromatin"],
      ["BmMDH2", "adp-ribose-methanol-dehydrogenase"],
    ] as const) {
      assert.ok(found(own).has(paper), `the paper's own "${own}" finds it`);
    }
    // A hyphen or a space where the paper runs the name together.
    for (const [variant, paper] of [
      ["IL-10", "il10-tolerance-birds"],
      ["mec A", "meca-daptomycin-tolerance"],
      ["H3K27 me3", "scml2-sperm-chromatin"],
      ["Bm MDH2", "adp-ribose-methanol-dehydrogenase"],
      ["interleukin-10", "il10-tolerance-birds"],
    ] as const) {
      assert.ok(found(variant).has(paper), `"${variant}" finds its paper`);
    }
    // A Greek letter written as its name, either way round.
    assert.ok(found("PPARalpha").has("ppara-brown-adipocytes"), '"PPARalpha" finds the PPARα paper');
    assert.ok(found("PPARα").has("ppara-brown-adipocytes"), '"PPARα" finds it too');
    // Not bridged, and not a spelling of the same name: a Latin letter for a Greek one, and a substring.
    assert.equal(found("Ppara").has("ppara-brown-adipocytes"), false, '"Ppara" is left for another change');
    assert.equal(found("MDH2").has("adp-ribose-methanol-dehydrogenase"), false, '"MDH2" is part of "BmMDH2", not a spelling of it');
  });
});

const FIELD_FLOOR = { documentRecall: 0.974, passageRecall: 0.933, complete: 69 };
const CS_FLOOR = { documentRecall: 0.972, passageRecall: 0.822, complete: 27 }; // 29 with 0.73.0's abbreviation place, taken out in 0.77.0
const LAB_FLOOR = { documentRecall: 0.976, passageRecall: 0.945, complete: 39 };

// A user's library can hold hundreds of documents; the field library has seven. With 300 generated
// documents near its topics added (eval/harness/distractors.ts), search still has to find what it
// finds now. Over seeds 1 to 5 the figures are 90.9–93.5% and 89.9–91%, 67 to 69 tasks, so a change
// that falls below the floors of seed 1 loses ground to a larger library, not to chance in the seed.
describe("chemical names in search (harness 0.98.0)", () => {
  it("finds a chemistry paper by a chemist's other spelling of a reagent, solvent or catalyst", async () => {
    // Measured before the dictionary was written: every spelling the papers use found its paper among the first
    // three results, and 13 of these 30 did not (eval/chem/README.md). The dictionary was written with these in
    // view, so this records the gap closed, not how general the dictionary is.
    const field = await loadFieldSuite();
    const found = (query: string) => new Set(appSearch(3)(field.chemLibrary, query).map((id) => id.replace(/#\d+$/, "")));
    const aliases: Array<[string, string]> = [
      ["bis(cyclooctadiene)nickel", "nickel-fluorobenzofuran-coupling"],
      ["tricyclohexylphosphine", "nickel-fluorobenzofuran-coupling"],
      ["potassium carbonate", "nickel-fluorobenzofuran-coupling"],
      ["dibromomethane", "nickel-fluorobenzofuran-coupling"],
      ["dimethylacetamide", "nickel-photoredox-hydroxytrifluoroethylation"],
      ["DMA", "nickel-photoredox-hydroxytrifluoroethylation"],
      ["trimethylacetic anhydride", "nickel-photoredox-hydroxytrifluoroethylation"],
      ["HEH", "nickel-photoredox-hydroxytrifluoroethylation"],
      ["Hünig's base", "propargylation-biisoquinoline-dioxide"],
      ["iPr2NEt", "propargylation-biisoquinoline-dioxide"],
      ["dichloromethane", "propargylation-biisoquinoline-dioxide"],
      ["DCM", "propargylation-biisoquinoline-dioxide"],
      ["trichlorosilane allenylation", "propargylation-biisoquinoline-dioxide"],
      ["sodium carbonate", "photoredox-isonitrile-arylation"],
      ["tris(bipyridine)ruthenium", "photoredox-isonitrile-arylation"],
      ["isocyanide", "photoredox-isonitrile-arylation"],
      ["cesium carbonate", "photoredox-isonitrile-arylation"],
      ["sodium 4-methylbenzenesulfinate", "polyaza-helicene-photoredox"],
      ["paraquat", "polyaza-helicene-photoredox"],
      ["potassium bicarbonate", "copper-step-edges-co2-reduction"],
      ["potassium hydrogen carbonate", "copper-step-edges-co2-reduction"],
      ["formic acid", "copper-step-edges-co2-reduction"],
      ["carbon nanofibres", "copper-step-edges-co2-reduction"],
      ["FeTPP", "porphyrin-aggregation-co2-reduction"],
      ["silver hexafluorophosphate", "porphyrin-aggregation-co2-reduction"],
      ["ferrocenium", "porphyrin-aggregation-co2-reduction"],
      ["Bu4NPF6", "porphyrin-aggregation-co2-reduction"],
      ["methyloxirane", "frustrated-lewis-pairs-co2-capture"],
      ["1,2-epoxypropane", "frustrated-lewis-pairs-co2-capture"],
      ["propylene carbonate", "frustrated-lewis-pairs-co2-capture"],
    ];
    const missed = aliases.filter(([alias, paper]) => !found(alias).has(paper)).map(([alias]) => alias);
    assert.deepEqual(missed, []);
    // The papers' own spellings still find them.
    for (const [own, paper] of [["Ni(cod)2", "nickel-fluorobenzofuran-coupling"], ["CH2Cl2", "propargylation-biisoquinoline-dioxide"], ["N,N-diisopropylethylamine", "propargylation-biisoquinoline-dioxide"], ["TBAPF6", "porphyrin-aggregation-co2-reduction"], ["KHCO3", "copper-step-edges-co2-reduction"]] as const) {
      assert.ok(found(own).has(paper), `"${own}" finds its paper`);
    }
  });

  it("keeps the chemistry papers' retrieval at least where it is", async () => {
    const field = await loadFieldSuite();
    const summary = summarizeRetrieval(measureRetrieval(field.chemLibrary, [...chemTasks, ...chemHoldoutTasks]));
    assert.ok(summary.complete >= 46, `${summary.complete} of ${summary.tasks} complete`);
  });
});

describe("materials names in search (harness 0.108.0)", () => {
  // Measured before the entries were written (eval/materials/README.md): 20 of these 31 found their document among the
  // first three results. The entries were written with them in view, so this records the gap closed, not how general the
  // list is. Two still miss on ranking alone: their entry adds the right term ("tib2", "hip"), and the parts of a
  // longer paper that write "titanium" or "hot pressing" fill the first three places.
  it("finds a materials document by a materials scientist's other spelling", async () => {
    const field = await loadFieldSuite();
    const found = (query: string) => new Set(appSearch(3)(field.materialsLibrary, query).map((id) => id.replace(/#\d+$/, "")));
    const aliases: Array<[string, string]> = [
      ["LFP", "lifepo4-combustion-synthesis"], ["lithium iron phosphate", "lifepo4-combustion-synthesis"],
      ["lithium lanthanum zirconium oxide", "llzo-hot-pressing-sps"], ["lithium lanthanum zirconate", "llzo-hot-pressing-sps"], ["LLZTO", "llzo-hot-pressing-sps"], ["Al-doped LLZO garnet", "llzo-al-cubic"],
      ["FAST", "llzo-hot-pressing-sps"], ["field assisted sintering", "llzo-hot-pressing-sps"], ["silicon carbide", "boron-carbide-sic-tib2"],
      ["polylactide", "pla-starch-hydrothermal-ageing"], ["polylactic acid", "pla-starch-hydrothermal-ageing"],
      ["propylammonium iodide", "perovskite-pai-passivation"], ["formamidinium", "perovskite-pai-passivation"], ["methylammonium", "perovskite-pai-passivation"], ["tin oxide", "perovskite-pai-passivation"], ["PSC", "perovskite-pai-passivation"],
      ["BT25", "tc25-titanium-creep"], ["L-PBF", "ti64-slm-tensile-log"], ["LPBF", "ti64-slm-tensile-log"], ["laser powder bed fusion", "ti64-slm-tensile-log"], ["Ti64", "ti64-slm-tensile-log"], ["TC4", "ti64-slm-tensile-log"],
      ["Al2O3-ZrO2", "zta-test-report"], ["YSZ", "zta-test-report"], ["yttria stabilised zirconia", "zta-test-report"],
      ["medium-Mn steel", "medium-manganese-steel-heating-rate"], ["TRIP steel", "medium-manganese-steel-heating-rate"],
      ["aluminium silicon alloy", "al-si-cu-mg-nickel-alloys"], ["A354", "al-si-cu-mg-nickel-alloys"],
    ];
    const missed = aliases.filter(([alias, doc]) => !found(alias).has(doc)).map(([alias]) => alias);
    assert.deepEqual(missed, []);
    for (const [own, doc] of [["LiFePO4", "lifepo4-combustion-synthesis"], ["LLZO", "llzo-hot-pressing-sps"], ["B4C", "boron-carbide-sic-tib2"], ["SLM", "ti64-slm-tensile-log"], ["ZTA", "zta-test-report"], ["TC25", "tc25-titanium-creep"]] as const) {
      assert.ok(found(own).has(doc), `"${own}" finds its document`);
    }
  });

  it("keeps the materials suite's retrieval where it is without the names", async () => {
    // 52 of 56 without the materials names; 49 when every spelling was added to every passage (chemical-names.ts).
    const field = await loadFieldSuite();
    const summary = summarizeRetrieval(measureRetrieval(field.materialsLibrary, [...materialsTasks, ...materialsHoldoutTasks]));
    assert.ok(summary.complete >= 52, `${summary.complete} of ${summary.tasks} complete`);
  });
});

describe("retrieval in a library of hundreds of documents", () => {
  it("generates the same documents for the same seed, apart from the real ones", () => {
    const docs = distractorDocuments(300);
    assert.equal(docs.length, 300);
    assert.deepEqual(distractorDocuments(300), docs);
    assert.notDeepEqual(distractorDocuments(300, 2), docs);
    assert.ok(docs.every((d) => d.id.startsWith(DISTRACTOR_PREFIX) && d.text.length > 0));
    assert.ok(docs.filter((d) => d.text.length > 1800).length >= 30, "some are long enough to be split into parts");
  });

  it("keeps the field suite's retrieval with 300 generated documents added", async () => {
    const field = await loadFieldSuite();
    const library = new ResearchLibrary([...field.library.documents, ...distractorDocuments(300)]);
    const summary = summarizeRetrieval(measureRetrieval(library, field.tasks));
    assert.ok(summary.documentRecall >= SCALE_FLOOR.documentRecall, `cited documents: ${summary.documentRecall}`);
    assert.ok(summary.passageRecall >= SCALE_FLOOR.passageRecall, `answer passages: ${summary.passageRecall}`);
    assert.ok(summary.complete >= SCALE_FLOOR.complete, `complete: ${summary.complete}`);
  });
});

// Since 0.57.0, headings kept with what they introduce lose one answer passage here (f46), on every
// size and seed measured; see eval/field/README.md, "Headings kept with what they introduce".
const SCALE_FLOOR = { documentRecall: 0.935, passageRecall: 0.899, complete: 68 };
