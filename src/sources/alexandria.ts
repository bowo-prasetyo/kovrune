// Alexandria (harness 0.109.0): computed crystal structures and their properties, through the OPTIMADE API,
// recommendation 9 of the materials science audit (docs/materials-science-audit.md, MS9).
//
// A materials scientist asks of a compound what a paper rarely gives in one place: which structures of it are
// known, which is stable, its band gap, its formation energy. OPTIMADE is the open standard API that crystal
// structure databases serve; for crystals it is what PubChem is for molecules. Of the providers checked on
// 2026-11-22 (eval/materials/README.md#optimade-providers), Alexandria (Ruhr University Bochum's database of
// DFT calculations, about five million structures) answers requests from web pages (CORS), needs no key, and
// answers in about a second, with each structure's band gap, formation energy and distance from the convex
// hull. The Materials Project, the COD, JARVIS and AFLOW send no CORS header, so a web page cannot read them.
//
// A search is a formula ("Li7La3Zr2O12", "TiO2"), a materials name Kovrune knows ("LLZO", "titania"), or a list
// of elements ("Li-La-Zr-O"). A structure is read as one document: its formula, space group, cell, computed
// properties and sites, saying that every value is computed, with which functional.

import { MATERIALS_NAMES } from "../tools/chemical-names.ts";
import { ATOMIC_WEIGHTS } from "../documents/chemfiles.ts";
import { getJson, SourceError, type FetchLike, type FetchedDocument, type OpenSource, type SourceHit } from "./types.ts";

export const ALEXANDRIA = "https://alexandria.icams.rub.de/pbe/v1";
const PREFIX = "alexandria:";
const HITS = 5;
/** Sites written in a structure's table; a supercell can have hundreds. */
const MAX_SITES = 60;

const SEARCH_FIELDS = [
  "chemical_formula_reduced",
  "nsites",
  "_alexandria_space_group",
  "_alexandria_band_gap",
  "_alexandria_hull_distance",
  "_alexandria_formation_energy_per_atom",
].join(",");

export interface AlexandriaAttributes {
  chemical_formula_reduced?: string;
  chemical_formula_descriptive?: string;
  elements?: string[];
  nsites?: number;
  lattice_vectors?: number[][];
  cartesian_site_positions?: number[][];
  species_at_sites?: string[];
  last_modified?: string;
  _alexandria_space_group?: number;
  _alexandria_band_gap?: number;
  _alexandria_band_gap_direct?: number;
  _alexandria_formation_energy_per_atom?: number;
  _alexandria_hull_distance?: number;
  _alexandria_decomposition?: string;
  _alexandria_xc_functional?: string;
  _alexandria_energy_corrected?: number;
  _alexandria_magnetization?: number;
}

export interface AlexandriaEntry {
  id: string;
  attributes: AlexandriaAttributes;
}

/** The ID the model sees for a structure, "alexandria:agm002115453". */
export const alexandriaDocId = (id: string) => `${PREFIX}${id}`;

const ELEMENT = /[A-Z][a-z]?/g;

/**
 * A formula's elements and counts: "Li7La3Zr2O12" and "Li7 La3 Zr2 O12" as Li 7, La 3, Zr 2, O 12. Undefined
 * when it is not a formula of known elements, or has brackets or a dopant's fraction ("Li6.25Al0.25…" is read,
 * with its fractions).
 */
export function parseFormula(text: string): Map<string, number> | undefined {
  const compact = text.replace(/\s+/g, "");
  if (!/^(?:[A-Z][a-z]?(?:\d+(?:\.\d+)?)?)+$/.test(compact)) return undefined;
  const counts = new Map<string, number>();
  for (const [, symbol, count] of compact.matchAll(/([A-Z][a-z]?)(\d+(?:\.\d+)?)?/g)) {
    if (ATOMIC_WEIGHTS[symbol!] === undefined || symbol === "D") return undefined;
    counts.set(symbol!, (counts.get(symbol!) ?? 0) + (count ? Number(count) : 1));
  }
  return counts.size ? counts : undefined;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * A formula as OPTIMADE's chemical_formula_reduced writes it: elements in alphabetical order, counts divided by
 * their greatest common divisor, a count of one left out. "TiO2" is "O2Ti", "Li7La3Zr2O12" is "La3Li7O12Zr2".
 * Undefined for fractional counts, which no reduced formula has.
 */
export function reducedFormula(counts: Map<string, number>): string | undefined {
  const values = [...counts.values()];
  if (!values.every(Number.isInteger)) return undefined;
  const divisor = values.reduce(gcd);
  return [...counts.keys()]
    .sort()
    .map((s) => `${s}${counts.get(s)! / divisor === 1 ? "" : counts.get(s)! / divisor}`)
    .join("");
}

/** A list of elements: "Li-La-Zr-O", "Li, La, Zr, O", "Li La Zr O". */
function elementList(text: string): string[] | undefined {
  const parts = text.split(/[\s,–-]+/).filter(Boolean);
  if (parts.length < 2 || !parts.every((p) => /^[A-Z][a-z]?$/.test(p) && ATOMIC_WEIGHTS[p] !== undefined && p !== "D")) return undefined;
  return [...new Set(parts)].sort();
}

/** Words that ask about a structure rather than name it, left out when a question is read for its formula. */
const ASKING = /\b(?:what|which|is|are|the|a|an|of|for|in|and|its|computed|calculated|dft|band|gap|gaps|formation|energy|energies|hull|stable|stability|structure|structures|space|group|groups|lattice|parameters?|cell|crystal|phases?|polymorphs?|known|density|alexandria|optimade)\b/gi;

/**
 * The OPTIMADE filters a search tries, in order: a formula written in the query, a materials name Kovrune
 * knows given as a formula (MATERIALS_NAMES: "LLZO" is Li7La3Zr2O12), or a list of elements. A formula with
 * fractions (a doped compound) is searched by its elements.
 */
export function filtersFor(query: string): string[] {
  const words = query
    .replace(ASKING, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[("']+|[)"'?!.,;:]+$/g, ""))
    .filter(Boolean);
  const filters: string[] = [];
  const byFormula = (counts: Map<string, number>) => {
    const reduced = reducedFormula(counts);
    const elements = [...counts.keys()].sort();
    filters.push(reduced ? `chemical_formula_reduced="${reduced}"` : `elements HAS ALL ${elements.map((e) => `"${e}"`).join(",")} AND nelements=${elements.length}`);
  };
  for (const word of words) {
    const counts = parseFormula(word);
    // One element alone ("O", "Li") is a word as often as a formula: it needs a count, or another element.
    if (counts && (counts.size > 1 || [...counts.values()][0]! > 1)) byFormula(counts);
  }
  if (!filters.length) {
    const lower = words.map((w) => w.toLowerCase());
    const text = ` ${lower.join(" ")} `;
    for (const entry of MATERIALS_NAMES) {
      if (!entry.some((spelling) => text.includes(` ${spelling.toLowerCase()} `))) continue;
      const formula = entry.map(parseFormula).find((c) => c && c.size > 1);
      if (formula) byFormula(formula);
    }
  }
  if (!filters.length) {
    const elements = elementList(words.join(" "));
    if (elements) filters.push(`elements HAS ALL ${elements.map((e) => `"${e}"`).join(",")} AND nelements=${elements.length}`);
  }
  return [...new Set(filters)];
}

/** The crystal system of a space group, by its number. */
export function crystalSystem(spaceGroup: number): string | undefined {
  if (!Number.isInteger(spaceGroup) || spaceGroup < 1 || spaceGroup > 230) return undefined;
  return spaceGroup <= 2 ? "triclinic" : spaceGroup <= 15 ? "monoclinic" : spaceGroup <= 74 ? "orthorhombic" : spaceGroup <= 142 ? "tetragonal" : spaceGroup <= 167 ? "trigonal" : spaceGroup <= 194 ? "hexagonal" : "cubic";
}

const round = (value: number, digits: number) => Number(value.toFixed(digits)).toString();

/** A hit's line: "La3Li7O12Zr2, space group 142 (tetragonal), band gap 4.35 eV, 0.006 eV/atom above the hull". */
function snippet(a: AlexandriaAttributes): string {
  const parts = [a.chemical_formula_reduced];
  if (a._alexandria_space_group) parts.push(`space group ${a._alexandria_space_group} (${crystalSystem(a._alexandria_space_group)})`);
  if (a._alexandria_band_gap !== undefined) parts.push(`band gap ${round(a._alexandria_band_gap, 2)} eV`);
  if (a._alexandria_hull_distance !== undefined) parts.push(a._alexandria_hull_distance <= 0 ? "on the convex hull" : `${round(a._alexandria_hull_distance, 3)} eV/atom above the hull`);
  if (a.nsites) parts.push(`${a.nsites} sites`);
  return `${parts.filter(Boolean).join(", ")} (computed, DFT PBE)`;
}

/** A cell's lengths (Å), angles (°) and volume (Å³) from its lattice vectors. */
export function cellOf(vectors: number[][]): { a: number; b: number; c: number; alpha: number; beta: number; gamma: number; volume: number } | undefined {
  if (vectors.length !== 3 || !vectors.every((v) => v.length === 3 && v.every(Number.isFinite))) return undefined;
  const [u, v, w] = vectors as [number[], number[], number[]];
  const dot = (x: number[], y: number[]) => x[0]! * y[0]! + x[1]! * y[1]! + x[2]! * y[2]!;
  const length = (x: number[]) => Math.sqrt(dot(x, x));
  const angle = (x: number[], y: number[]) => (Math.acos(dot(x, y) / (length(x) * length(y))) * 180) / Math.PI;
  const cross = [v[1]! * w[2]! - v[2]! * w[1]!, v[2]! * w[0]! - v[0]! * w[2]!, v[0]! * w[1]! - v[1]! * w[0]!];
  return { a: length(u), b: length(v), c: length(w), alpha: angle(v, w), beta: angle(u, w), gamma: angle(u, v), volume: Math.abs(dot(u, cross)) };
}

/** A structure's text: its formula, symmetry, cell, computed properties and sites, each computed value said to be so. */
export function structureText(entry: AlexandriaEntry): string {
  const a = entry.attributes;
  const formula = a.chemical_formula_reduced ?? entry.id;
  const lines = [`# ${formula} (Alexandria ${entry.id})`];
  lines.push("A structure computed with density functional theory (Alexandria, PBE functional): every value below is computed, not measured. PBE band gaps are usually smaller than measured ones.");
  if (a.chemical_formula_descriptive) lines.push(`Formula of the cell: ${a.chemical_formula_descriptive}`);
  if (a.chemical_formula_reduced) lines.push(`Reduced formula: ${a.chemical_formula_reduced}`);
  if (a._alexandria_space_group) lines.push(`Space group number: ${a._alexandria_space_group} (${crystalSystem(a._alexandria_space_group)})`);
  const cell = a.lattice_vectors ? cellOf(a.lattice_vectors) : undefined;
  if (cell) {
    lines.push(`Cell: a = ${cell.a.toFixed(4)} Å, b = ${cell.b.toFixed(4)} Å, c = ${cell.c.toFixed(4)} Å, α = ${cell.alpha.toFixed(2)}°, β = ${cell.beta.toFixed(2)}°, γ = ${cell.gamma.toFixed(2)}° (worked out by Kovrune from the lattice vectors)`);
    lines.push(`Cell volume: ${cell.volume.toFixed(2)} Å³ (worked out by Kovrune from the lattice vectors)`);
    const mass = (a.species_at_sites ?? []).reduce((sum, s) => sum + (ATOMIC_WEIGHTS[s] ?? NaN), 0);
    if (a.species_at_sites?.length && Number.isFinite(mass)) lines.push(`Density: ${(mass / (cell.volume * 0.602214076)).toFixed(3)} g/cm³ (worked out by Kovrune from the sites and the cell volume)`);
  }
  if (a.nsites) lines.push(`Sites in the cell: ${a.nsites}`);
  if (a._alexandria_band_gap !== undefined) lines.push(`Band gap: ${round(a._alexandria_band_gap, 4)} eV${a._alexandria_band_gap === 0 ? " (a metal in this calculation)" : ""}`);
  if (a._alexandria_band_gap_direct !== undefined) lines.push(`Direct band gap: ${round(a._alexandria_band_gap_direct, 4)} eV`);
  if (a._alexandria_formation_energy_per_atom !== undefined) lines.push(`Formation energy: ${round(a._alexandria_formation_energy_per_atom, 4)} eV/atom`);
  if (a._alexandria_hull_distance !== undefined) lines.push(`Distance from the convex hull: ${round(a._alexandria_hull_distance, 4)} eV/atom${a._alexandria_hull_distance <= 0 ? " (on the hull: stable in this calculation)" : ""}`);
  if (a._alexandria_decomposition?.trim()) lines.push(`Decomposes into: ${a._alexandria_decomposition.trim().split(/\s+/).join(", ")}`);
  if (a._alexandria_magnetization !== undefined) lines.push(`Magnetization: ${round(a._alexandria_magnetization, 4)} μB per cell`);
  if (a._alexandria_xc_functional) lines.push(`Exchange–correlation functional: ${a._alexandria_xc_functional}`);
  if (a.last_modified) lines.push(`Last modified: ${a.last_modified.slice(0, 10)}`);
  const sites = a.species_at_sites ?? [];
  const positions = a.cartesian_site_positions ?? [];
  if (sites.length && positions.length === sites.length) {
    lines.push("", "## Sites (Cartesian positions, Å)");
    sites.slice(0, MAX_SITES).forEach((s, i) => lines.push(`${s} | ${positions[i]!.map((x) => x.toFixed(4)).join(" | ")}`));
    if (sites.length > MAX_SITES) lines.push(`(${sites.length - MAX_SITES} more sites on Alexandria)`);
  }
  return lines.join("\n");
}

/**
 * Alexandria (PBE) as an open source. A search tries filtersFor's filters in turn and gives up to five
 * structures, the most stable first (closest to the convex hull). Reading a structure asks for its entry.
 */
export function createAlexandria(fetchImpl: FetchLike = fetch): OpenSource {
  const label = "Alexandria";
  return {
    name: "alexandria",
    label,
    searchHint: "Query one formula (Li7La3Zr2O12, TiO2), a materials name (LLZO, titania) or a list of elements (Li-La-Zr-O), not a question.",
    async search(query, signal) {
      for (const filter of filtersFor(query)) {
        const data = await getJson(fetchImpl, label, `${ALEXANDRIA}/structures?filter=${encodeURIComponent(filter)}&page_limit=50&response_fields=${SEARCH_FIELDS}`, signal);
        const entries = ((data?.data ?? []) as AlexandriaEntry[]).filter((e) => e?.id && e.attributes);
        if (!entries.length) continue;
        entries.sort((x, y) => (x.attributes._alexandria_hull_distance ?? Infinity) - (y.attributes._alexandria_hull_distance ?? Infinity));
        return entries.slice(0, HITS).map((e): SourceHit => ({ id: alexandriaDocId(e.id), title: `${e.attributes.chemical_formula_reduced ?? e.id} (Alexandria ${e.id})`, snippet: snippet(e.attributes) }));
      }
      return [];
    },
    async fetch(id, signal) {
      const bare = /^alexandria:([A-Za-z0-9_-]+)$/.exec(id)?.[1];
      if (!bare) throw new SourceError(`"${id}" is not an Alexandria structure ID.`);
      const data = await getJson(fetchImpl, label, `${ALEXANDRIA}/structures/${encodeURIComponent(bare)}`, signal);
      const entry = data?.data as AlexandriaEntry | undefined;
      if (!entry?.attributes) throw new SourceError(`Alexandria has no structure ${bare}.`);
      const doc: FetchedDocument = {
        id: alexandriaDocId(bare),
        title: `${entry.attributes.chemical_formula_reduced ?? bare} (Alexandria ${bare})`,
        text: structureText({ ...entry, id: bare }),
        url: `${ALEXANDRIA}/structures/${encodeURIComponent(bare)}`,
        retrievedAt: new Date().toISOString(),
      };
      return doc;
    },
  };
}
