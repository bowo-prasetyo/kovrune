import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anyOpenSource, openSourceNames, openSourcesFor, parseSourcePrefs } from "../src/app/research/sources.ts";
import { ALEXANDRIA, cellOf, createAlexandria, crystalSystem, filtersFor, parseFormula, reducedFormula, structureText, type AlexandriaEntry } from "../src/sources/alexandria.ts";
import type { FetchLike } from "../src/sources/types.ts";

// Answers as Alexandria's OPTIMADE API gave them on 2026-11-22, cut to the fields read.
const LLZO_SEARCH = {
  data: [
    { id: "agm003282803", type: "structures", attributes: { chemical_formula_reduced: "La3Li7O12Zr2", nsites: 96, _alexandria_space_group: 142, _alexandria_hull_distance: 0.0064920085, _alexandria_formation_energy_per_atom: -3.1250587, _alexandria_band_gap: 4.3483 } },
  ],
};
const AL2O: AlexandriaEntry = {
  id: "agm002115453",
  attributes: {
    chemical_formula_reduced: "Al2O",
    chemical_formula_descriptive: "Al8 O4",
    nsites: 12,
    lattice_vectors: [[4.75730307, 0.0, -0.03049186], [0.0, 2.90139216, 0.0], [-1.11010694, 0.0, 11.64699723]],
    cartesian_site_positions: [[0.0, 1.45069608, 0.0], [-0.55505347, 0.0, 5.823498615], [2.667947318733745, 0.0, 8.911047964858689], [0.979248811266255, 0.0, 2.7054574051413107], [3.223000788733745, 1.45069608, 3.0875493498586892], [0.4241953412662549, 1.45069608, 8.528956020141312], [1.8235980649999999, 1.45069608, 5.808252685], [2.378651535, 0.0, -0.01524593], [4.196011628785287, 0.0, 3.8567255919491017], [-0.5488154987852873, 0.0, 7.759779778050898], [3.640958158785287, 1.45069608, 9.680224206949102], [0.006237971214712653, 1.45069608, 1.9362811630508985]],
    species_at_sites: ["Al", "Al", "Al", "Al", "Al", "Al", "Al", "Al", "O", "O", "O", "O"],
    last_modified: "2023-11-16T07:57:59Z",
    _alexandria_space_group: 12,
    _alexandria_band_gap: 0.0,
    _alexandria_band_gap_direct: 0.181,
    _alexandria_formation_energy_per_atom: -1.6044346,
    _alexandria_hull_distance: 0.30061784,
    _alexandria_decomposition: " Al2O3  Al ",
    _alexandria_xc_functional: "gga_x_pbe + gga_c_pbe",
  },
};

function fakeFetch(routes: Record<string, unknown>, asked: string[] = []): FetchLike {
  return async (url) => {
    asked.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    return key ? { ok: true, status: 200, json: async () => routes[key] } : { ok: true, status: 200, json: async () => ({ data: [] }) };
  };
}

describe("Alexandria through OPTIMADE (harness 0.109.0)", () => {
  it("writes a formula as OPTIMADE's reduced formula", () => {
    assert.equal(reducedFormula(parseFormula("TiO2")!), "O2Ti");
    assert.equal(reducedFormula(parseFormula("Li7La3Zr2O12")!), "La3Li7O12Zr2");
    assert.equal(reducedFormula(parseFormula("Al4O6")!), "Al2O3");
    assert.equal(reducedFormula(parseFormula("Li6.25Al0.25La3Zr2O12")!), undefined, "a doped formula has no reduced formula");
    assert.equal(parseFormula("Hello"), undefined);
    assert.equal(parseFormula("Xy2"), undefined);
  });

  it("searches a formula, a materials name or a list of elements, not the words of a question", () => {
    assert.deepEqual(filtersFor("band gap of TiO2"), ['chemical_formula_reduced="O2Ti"']);
    assert.deepEqual(filtersFor("LLZO"), ['chemical_formula_reduced="La3Li7O12Zr2"']);
    assert.deepEqual(filtersFor("titania"), ['chemical_formula_reduced="O2Ti"']);
    assert.deepEqual(filtersFor("Li-La-Zr-O"), ['elements HAS ALL "La","Li","O","Zr" AND nelements=4']);
    assert.deepEqual(filtersFor("Li6.25Al0.25La3Zr2O12"), ['elements HAS ALL "Al","La","Li","O","Zr" AND nelements=5']);
    assert.deepEqual(filtersFor("Is it stable?"), []);
  });

  it("gives the most stable structures first, with their space group, band gap and hull distance", async () => {
    const asked: string[] = [];
    const hits = await createAlexandria(fakeFetch({ "/structures?filter=": LLZO_SEARCH }, asked)).search("LLZO");
    assert.ok(asked[0]!.startsWith(`${ALEXANDRIA}/structures?filter=${encodeURIComponent('chemical_formula_reduced="La3Li7O12Zr2"')}`));
    assert.deepEqual(hits, [
      { id: "alexandria:agm003282803", title: "La3Li7O12Zr2 (Alexandria agm003282803)", snippet: "La3Li7O12Zr2, space group 142 (tetragonal), band gap 4.35 eV, 0.006 eV/atom above the hull, 96 sites (computed, DFT PBE)" },
    ]);
    assert.deepEqual(await createAlexandria(fakeFetch({})).search("what is stable"), []);
  });

  it("reads a structure with its cell worked out, its computed properties, and says they are computed", async () => {
    const doc = await createAlexandria(fakeFetch({ "/structures/agm002115453": { data: AL2O } })).fetch("alexandria:agm002115453");
    assert.equal(doc.title, "Al2O (Alexandria agm002115453)");
    for (const line of [
      "Space group number: 12 (monoclinic)",
      "Band gap: 0 eV (a metal in this calculation)",
      "Direct band gap: 0.181 eV",
      "Formation energy: -1.6044 eV/atom",
      "Distance from the convex hull: 0.3006 eV/atom",
      "Decomposes into: Al2O3, Al",
      "Exchange–correlation functional: gga_x_pbe + gga_c_pbe",
    ]) assert.ok(doc.text.split("\n").includes(line), line);
    assert.match(doc.text, /every value below is computed, not measured/);
    assert.match(doc.text, /^Cell: a = 4\.7574 Å, b = 2\.9014 Å, c = 11\.6998 Å, α = 90\.00°, β = 95\.81°, γ = 90\.00°/m);
    assert.match(doc.text, /^Al \| 0\.0000 \| 1\.4507 \| 0\.0000$/m);
    await assert.rejects(createAlexandria(fakeFetch({})).fetch("pubchem:1"), /not an Alexandria structure ID/);
  });

  it("works out a cubic cell's lengths, angles and volume, and names crystal systems", () => {
    const cell = cellOf([[4, 0, 0], [0, 4, 0], [0, 0, 4]])!;
    assert.deepEqual([cell.a, cell.alpha, cell.volume], [4, 90, 64]);
    assert.deepEqual([1, 15, 16, 142, 143, 194, 230, 231].map(crystalSystem), ["triclinic", "monoclinic", "orthorhombic", "tetragonal", "trigonal", "hexagonal", "cubic", undefined]);
    assert.match(structureText({ id: "x", attributes: {} }), /^# x \(Alexandria x\)/);
  });

  it("is an open source the user ticks", () => {
    const prefs = parseSourcePrefs(JSON.stringify({ alexandria: true }));
    assert.equal(prefs.alexandria, true);
    assert.equal(anyOpenSource(prefs), true);
    assert.deepEqual(openSourceNames(prefs), ["Alexandria"]);
    assert.deepEqual(openSourcesFor(prefs).map((s) => s.name), ["alexandria"]);
    assert.equal(parseSourcePrefs(JSON.stringify({ alexandria: "yes" })).alexandria, undefined);
  });
});
