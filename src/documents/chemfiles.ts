// Chemistry files a researcher keeps beside papers (harness 0.99.0), read as text that can be searched and
// quoted, recommendation 6 of the chemistry researcher's audit (eval/chem/README.md):
// - CIF, the crystallographic information file (.cif): a crystal structure's cell, space group, formula and
//   refinement, as name–value items and tables ("loops") of atoms, bonds and reflections;
// - MDL molfiles and SD files (.mol, .sdf): one or more structures, each with its atoms and bonds and, in an
//   SD file, data items such as a name, an identifier or a measured value;
// - JCAMP-DX (.jdx, .dx, .jcamp): an IR, Raman, UV–vis, NMR or mass spectrum, as labelled header lines and
//   the spectrum's points.
//
// What a reader writes is what the file says, in its words: CIF's "_cell_length_a 10.234(3)" is
// "cell length a: 10.234(3)", and a molfile's data item "> <MW>" is "MW: 180.16". Two things are worked out,
// and say so: a molecule's formula, from its atoms and the hydrogens their valences leave (a drawing usually
// leaves them out), and the points a spectrum has, from its header. A spectrum's points themselves are not
// written: thousands of numbers no one quotes. Its peak table, when the file has one, is.

import { renderTable, type TableRow } from "./tables.ts";

/** The longest table a reader writes: a CIF's reflections can run to tens of thousands of rows, which no one quotes. */
export const MAX_CHEM_ROWS = 2000;

export interface ChemText {
  text: string;
  warning?: string;
}

function table(header: string[], rows: string[][]): string {
  const tableRows: TableRow[] = [header, ...rows].map((cells, i) => ({ cells: cells.map((text) => ({ text, span: 1 })), header: i === 0, skip: 0 }));
  return renderTable(tableRows);
}

// ---------------------------------------------------------------------------------------------
// CIF

type CifToken = { text: string; quoted: boolean };

/** A CIF line's tokens: bare words, and '…' and "…" strings (a quote ends only before a space or the line's end). */
function cifTokens(line: string): CifToken[] {
  const tokens: CifToken[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "#") break;
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < line.length && !(line[j] === c && (j + 1 === line.length || /\s/.test(line[j + 1]!)))) j++;
      tokens.push({ text: line.slice(i + 1, j), quoted: true });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < line.length && !/\s/.test(line[j]!)) j++;
    tokens.push({ text: line.slice(i, j), quoted: false });
    i = j;
  }
  return tokens;
}

/** A CIF file's tokens, with each text field (the lines between two lines starting ";") as one quoted token. */
function cifStream(raw: string): CifToken[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const out: CifToken[] = [];
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!;
    if (line.startsWith(";")) {
      const field = [line.slice(1)];
      while (++n < lines.length && !lines[n]!.startsWith(";")) field.push(lines[n]!);
      out.push({ text: field.join("\n").trim(), quoted: true });
      continue;
    }
    out.push(...cifTokens(line));
  }
  return out;
}

/** "_cell_length_a" as "cell length a". */
const cifName = (tag: string) => tag.replace(/^_/, "").replace(/[_.]+/g, " ").trim();

/** CIF's "?" (unknown) and "." (does not apply) say nothing. */
const said = (value: string) => value !== "?" && value !== ".";

/**
 * A CIF file as text: each data block a heading ("data_compound1"), its items as "name: value" lines in
 * the file's order, and each loop a table whose columns are the loop's tags without their shared start
 * ("atom site label" … as "label", "type symbol", "fract x"). Unknown and inapplicable values are left out.
 */
export function readCif(raw: string): ChemText {
  const tokens = cifStream(raw);
  const out: string[] = [];
  let cut = false;
  let i = 0;
  const isTag = (t: CifToken | undefined) => t !== undefined && !t.quoted && t.text.startsWith("_");
  const isKeyword = (t: CifToken | undefined) => t !== undefined && !t.quoted && /^(?:data_|loop_|save_|global_|stop_)/i.test(t.text);
  // The current block's items, by tag in one form ("cell_length_a" for "_cell_length_a" and "_cell.length_a"), for what is worked out from them.
  let items = new Map<string, string>();
  const endBlock = () => {
    out.push(...cellDerived(items));
    items = new Map();
  };
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (!t.quoted && /^data_/i.test(t.text)) {
      endBlock();
      out.push(`${out.length ? "\n" : ""}# ${t.text}`);
      i++;
    } else if (!t.quoted && /^loop_$/i.test(t.text)) {
      i++;
      const tags: string[] = [];
      while (isTag(tokens[i])) tags.push(tokens[i++]!.text);
      const values: string[] = [];
      while (i < tokens.length && !isTag(tokens[i]) && !isKeyword(tokens[i])) values.push(tokens[i++]!.text);
      if (!tags.length) continue;
      const rows: string[][] = [];
      for (let r = 0; r + tags.length <= values.length; r += tags.length) rows.push(values.slice(r, r + tags.length).map((v) => (said(v) ? v : "")));
      if (rows.length > MAX_CHEM_ROWS) {
        rows.length = MAX_CHEM_ROWS;
        cut = true;
      }
      const names = tags.map(cifName);
      const shared = sharedStart(names);
      const header = names.map((name) => name.slice(shared.length).trim() || name);
      out.push(`\n${shared.trim() || "loop"}:`);
      if (rows.length) out.push(table(header, rows));
    } else if (isTag(t)) {
      const value = tokens[i + 1];
      if (value && !isTag(value) && !isKeyword(value)) {
        if (said(value.text)) {
          out.push(`${cifName(t.text)}: ${value.text.includes("\n") ? `\n${value.text}` : value.text}`);
          items.set(cifKey(t.text), value.text);
        }
        i += 2;
      } else i++;
    } else i++;
  }
  endBlock();
  const text = out.join("\n").trim();
  return {
    text,
    ...(!text ? { warning: "This file has no CIF data." } : cut ? { warning: `A table in this file has more than ${MAX_CHEM_ROWS} rows; only the first ${MAX_CHEM_ROWS} were read.` } : {}),
  };
}

/** A tag in one form: "_cell_length_a" and mmCIF's "_cell.length_a" are "cell_length_a". */
const cifKey = (tag: string) => tag.replace(/^_/, "").replace(/\./g, "_").toLowerCase();

/** A CIF number without its standard uncertainty: "12.9682(5)" is 12.9682. Undefined when it is not a number. */
function cifNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(?:\(\d+\))?$/.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

/** A formula's weight from a CIF's "_chemical_formula_sum" ("Al0.25 La3 Li6.25 O12 Zr2"), when every element's weight is known. */
function formulaWeight(sum: string): number | undefined {
  const parts = sum.trim().split(/\s+/);
  let weight = 0;
  for (const part of parts) {
    const match = /^([A-Z][a-z]?)(\d*\.?\d*)$/.exec(part);
    const mass = match ? ATOMIC_WEIGHTS[match[1]!] : undefined;
    if (!match || mass === undefined) return undefined;
    weight += mass * (match[2] ? Number(match[2]) : 1);
  }
  return weight > 0 ? weight : undefined;
}

/** Avogadro's number times 10⁻²⁴ cm³ per Å³: Z · M / (V · this) is a density in g/cm³. */
const AVOGADRO_A3 = 0.602214076;

/**
 * What a CIF's cell gives that the file may leave out (harness 0.109.0; docs/materials-science-audit.md,
 * MS11): the cell's volume, from its lengths and angles, and the density it gives, from Z and the formula
 * weight (or, without one, the formula). Each is written only when the file does not give it, and says it
 * was worked out, as a molfile's formula does.
 */
function cellDerived(items: Map<string, string>): string[] {
  const [a, b, c] = ["a", "b", "c"].map((x) => cifNumber(items.get(`cell_length_${x}`)));
  const [alpha, beta, gamma] = ["alpha", "beta", "gamma"].map((x) => cifNumber(items.get(`cell_angle_${x}`)));
  const lines: string[] = [];
  let volume = cifNumber(items.get("cell_volume"));
  if (volume === undefined && a && b && c && alpha && beta && gamma) {
    const [ca, cb, cg] = [alpha, beta, gamma].map((angle) => Math.cos((angle * Math.PI) / 180));
    const root = 1 - ca! ** 2 - cb! ** 2 - cg! ** 2 + 2 * ca! * cb! * cg!;
    if (root > 0) {
      volume = a * b * c * Math.sqrt(root);
      lines.push(`cell volume: ${volume.toFixed(2)} Å³ (worked out by Kovrune from the cell's lengths and angles)`);
    }
  }
  const z = cifNumber(items.get("cell_formula_units_z"));
  const given = cifNumber(items.get("chemical_formula_weight"));
  const sum = items.get("chemical_formula_sum");
  const weight = given ?? (sum ? formulaWeight(sum) : undefined);
  if (cifNumber(items.get("exptl_crystal_density_diffrn")) === undefined && volume && z && weight) {
    const density = (z * weight) / (volume * AVOGADRO_A3);
    const from = given !== undefined ? "the formula weight" : "the formula's weight";
    lines.push(`calculated density: ${density.toFixed(3)} g/cm³ (worked out by Kovrune from Z, ${from} and the cell volume)`);
  }
  return lines;
}

/** The words every name starts with: "atom site" for "atom site label" and "atom site fract x". */
function sharedStart(names: string[]): string {
  if (names.length < 2) return "";
  const split = names.map((n) => n.split(" "));
  const words: string[] = [];
  for (let w = 0; split.every((s) => s.length > w + 1 && s[w] === split[0]![w]); w++) words.push(split[0]![w]!);
  return words.length ? `${words.join(" ")} ` : "";
}

// ---------------------------------------------------------------------------------------------
// Molfiles and SD files

/** Standard atomic weights (IUPAC, abridged), for the elements a molfile from a chemistry lab mostly has. */
export const ATOMIC_WEIGHTS: Record<string, number> = {
  H: 1.008, Li: 6.94, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974,
  S: 32.06, Cl: 35.45, K: 39.098, Ca: 40.078, Ti: 47.867, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546,
  Zn: 65.38, Ga: 69.723, Ge: 72.63, As: 74.922, Se: 78.971, Br: 79.904, Rb: 85.468, Sr: 87.62, Zr: 91.224, Mo: 95.95, Ru: 101.07,
  Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71, Sb: 121.76, Te: 127.6, I: 126.9, Cs: 132.91, Ba: 137.33,
  W: 183.84, Os: 190.23, Ir: 192.22, Pt: 195.08, Au: 196.97, Hg: 200.59, Tl: 204.38, Pb: 207.2, Bi: 208.98, D: 2.014,
  // The rest of the elements in solids (harness 0.109.0), for the formula weight of a crystal structure (readCif).
  He: 4.0026, Be: 9.0122, Ne: 20.18, Ar: 39.95, Sc: 44.956, V: 50.942, Kr: 83.798, Y: 88.906, Nb: 92.906, Tc: 98, Xe: 131.29,
  La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24, Pm: 145, Sm: 150.36, Eu: 151.96, Gd: 157.25, Tb: 158.93, Dy: 162.5, Ho: 164.93,
  Er: 167.26, Tm: 168.93, Yb: 173.05, Lu: 174.97, Hf: 178.49, Ta: 180.95, Re: 186.21, Po: 209, At: 210, Rn: 222, Fr: 223, Ra: 226,
  Ac: 227, Th: 232.04, Pa: 231.04, U: 238.03, Np: 237, Pu: 244, Am: 243,
};

/**
 * The usual valences of the elements whose hydrogens a drawing leaves out, as the molfile format and
 * cheminformatics toolkits count them: the smallest that covers the atom's bonds. Other elements get none.
 */
const VALENCES: Record<string, number[]> = { B: [3], C: [4], N: [3, 5], O: [2], P: [3, 5], S: [2, 4, 6], F: [1], Cl: [1, 3, 5, 7], Br: [1, 3, 5, 7], I: [1, 3, 5, 7], Si: [4], Se: [2, 4, 6] };

interface Atom {
  symbol: string;
  charge: number;
  /** Hydrogens the file sets (V3000's HCOUNT, or a query's count), when it does. */
  hydrogens?: number;
  /** Bond orders, aromatic as 1.5. */
  bonds: number;
  radical: number;
}

interface Molecule {
  name: string;
  atoms: Atom[];
  bondCount: number;
  data: Array<[string, string]>;
  version: "V2000" | "V3000";
}

/** The hydrogens an atom carries that are not drawn: its valence less its bonds, with a charge moving it as for N⁺ (4) and O⁻ (1). */
function implicitHydrogens(atom: Atom): number {
  if (atom.hydrogens !== undefined) return atom.hydrogens;
  const valences = VALENCES[atom.symbol];
  if (!valences) return 0;
  // A charge on N, O, P or S adds a bond (N⁺, O⁺: ammonium, oxonium) or takes one (O⁻, N⁻); on C, B either way takes one.
  const shift = atom.symbol === "C" || atom.symbol === "B" ? -Math.abs(atom.charge) : ["N", "P", "O", "S", "Se"].includes(atom.symbol) ? atom.charge : -Math.abs(atom.charge);
  const bonds = Math.ceil(atom.bonds - 1e-9);
  for (const v of valences) {
    const valence = v + shift - atom.radical;
    if (valence >= bonds) return valence - bonds;
  }
  return 0;
}

/** A formula in Hill order: C, then H, then the rest alphabetically; without carbon, all alphabetically. */
export function hillFormula(counts: Map<string, number>): string {
  const symbols = [...counts.keys()].filter((s) => counts.get(s)! > 0);
  const order = counts.get("C") ? ["C", "H", ...symbols.filter((s) => s !== "C" && s !== "H").sort()] : symbols.sort();
  return order.filter((s) => counts.get(s)).map((s) => `${s}${counts.get(s) === 1 ? "" : counts.get(s)}`).join("");
}

const RADICALS: Record<number, number> = { 1: 2, 2: 1, 3: 2 };

function parseV2000(lines: string[], name: string): Molecule | undefined {
  const counts = lines[3] ?? "";
  const atomCount = Number(counts.slice(0, 3));
  const bondCount = Number(counts.slice(3, 6));
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) return undefined;
  const atoms: Atom[] = [];
  for (let n = 0; n < atomCount; n++) {
    const line = lines[4 + n] ?? "";
    const symbol = line.slice(31, 34).trim();
    const oldCharge = Number(line.slice(36, 39)) || 0;
    // The atom block's old charge code: 1, 2, 3 are +3, +2, +1; 5, 6, 7 are −1, −2, −3; 4 is a radical.
    const charge = oldCharge >= 1 && oldCharge <= 7 && oldCharge !== 4 ? 4 - oldCharge : 0;
    atoms.push({ symbol, charge, bonds: 0, radical: oldCharge === 4 ? 1 : 0 });
  }
  for (let n = 0; n < bondCount; n++) {
    const line = lines[4 + atomCount + n] ?? "";
    const a = Number(line.slice(0, 3)) - 1;
    const b = Number(line.slice(3, 6)) - 1;
    const type = Number(line.slice(6, 9));
    const order = type === 4 ? 1.5 : type >= 1 && type <= 3 ? type : 1;
    if (atoms[a]) atoms[a].bonds += order;
    if (atoms[b]) atoms[b].bonds += order;
  }
  // The properties block's charges and radicals replace the atom block's.
  let chargesSet = false;
  for (const line of lines.slice(4 + atomCount + bondCount)) {
    if (line.startsWith("M  END")) break;
    const prop = /^M {2}(CHG|RAD)\s+(\d+)((?:\s+-?\d+\s+-?\d+)+)/.exec(line);
    if (!prop) continue;
    const pairs = prop[3]!.trim().split(/\s+/).map(Number);
    if (prop[1] === "CHG" && !chargesSet) {
      for (const atom of atoms) atom.charge = 0;
      chargesSet = true;
    }
    for (let p = 0; p + 1 < pairs.length; p += 2) {
      const atom = atoms[pairs[p]! - 1];
      if (!atom) continue;
      if (prop[1] === "CHG") atom.charge = pairs[p + 1]!;
      else atom.radical = RADICALS[pairs[p + 1]!] ?? 0;
    }
  }
  return { name, atoms, bondCount, data: [], version: "V2000" };
}

function parseV3000(lines: string[], name: string): Molecule | undefined {
  const v30 = lines.filter((l) => l.startsWith("M  V30 ")).map((l) => l.slice(7));
  // A line ending in "-" continues on the next.
  const joined: string[] = [];
  for (const l of v30) {
    if (joined.length && joined.at(-1)!.endsWith("-")) joined[joined.length - 1] = joined.at(-1)!.slice(0, -1) + l;
    else joined.push(l);
  }
  const atoms: Atom[] = [];
  const index = new Map<string, Atom>();
  let bondCount = 0;
  let block = "";
  for (const line of joined) {
    const begin = /^BEGIN (\w+)/.exec(line);
    if (begin) {
      block = begin[1]!;
      continue;
    }
    if (line.startsWith("END ")) {
      block = "";
      continue;
    }
    const fields = line.trim().split(/\s+/);
    if (block === "ATOM" && fields.length >= 5) {
      const atom: Atom = { symbol: fields[1]!, charge: 0, bonds: 0, radical: 0 };
      for (const field of fields.slice(6)) {
        const [key, value] = field.split("=");
        if (key === "CHG") atom.charge = Number(value) || 0;
        if (key === "RAD") atom.radical = RADICALS[Number(value)] ?? 0;
        if (key === "HCOUNT" && Number(value) > 0) atom.hydrogens = Number(value) - 1;
      }
      atoms.push(atom);
      index.set(fields[0]!, atom);
    } else if (block === "BOND" && fields.length >= 4) {
      bondCount++;
      const type = Number(fields[1]);
      const order = type === 4 ? 1.5 : type >= 1 && type <= 3 ? type : 1;
      for (const id of [fields[2]!, fields[3]!]) {
        const atom = index.get(id);
        if (atom) atom.bonds += order;
      }
    }
  }
  return atoms.length ? { name, atoms, bondCount, data: [], version: "V3000" } : undefined;
}

/** An SD file's data items after "M  END": "> <NAME>" lines and their values, up to a blank line. */
function dataItems(lines: string[]): Array<[string, string]> {
  const items: Array<[string, string]> = [];
  for (let n = 0; n < lines.length; n++) {
    const head = /^>.*?<([^>]+)>/.exec(lines[n]!);
    if (!head) continue;
    const value: string[] = [];
    while (++n < lines.length && lines[n]!.trim() !== "") value.push(lines[n]!.trim());
    items.push([head[1]!.trim(), value.join(" ")]);
  }
  return items;
}

function moleculeText(molecule: Molecule, n: number, of: number): string {
  const counts = new Map<string, number>();
  let hydrogens = 0;
  for (const atom of molecule.atoms) {
    const symbol = atom.symbol === "D" || atom.symbol === "T" ? "H" : atom.symbol;
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    const h = implicitHydrogens(atom);
    hydrogens += h;
  }
  if (hydrogens) counts.set("H", (counts.get("H") ?? 0) + hydrogens);
  const charge = molecule.atoms.reduce((sum, a) => sum + a.charge, 0);
  const known = [...counts.keys()].every((s) => ATOMIC_WEIGHTS[s] !== undefined);
  const weight = [...counts].reduce((sum, [s, c]) => sum + (ATOMIC_WEIGHTS[s] ?? 0) * c, 0);
  const title = molecule.name.trim() || (of > 1 ? `Molecule ${n}` : "Molecule");
  const lines = [`${of > 1 ? "## " : "# "}${title}`];
  if (molecule.atoms.length) {
    const formula = hillFormula(counts) + (charge ? `${Math.abs(charge) === 1 ? "" : Math.abs(charge)}${charge > 0 ? "+" : "−"}` : "");
    lines.push(`Formula: ${formula} (worked out by Kovrune from the structure${hydrogens ? ", with the hydrogens its atoms' valences leave" : ""})`);
    if (known) lines.push(`Molecular weight: ${weight.toFixed(2)} g/mol (worked out by Kovrune from the formula)`);
    lines.push(`Atoms drawn: ${molecule.atoms.length}; bonds: ${molecule.bondCount}`);
  }
  for (const [key, value] of molecule.data) if (value) lines.push(`${key}: ${value}`);
  return lines.join("\n");
}

/**
 * A molfile or SD file as text: each structure its name (the first line), its formula and molecular weight
 * as worked out from its atoms, the atoms and bonds drawn, and its data items. Molfiles of both versions
 * (V2000 and V3000) are read; a record that is neither is left out, and the warning says how many were.
 */
export function readMolfile(raw: string): ChemText {
  const records = raw.replace(/\r\n?/g, "\n").split(/^\$\$\$\$\s*$/m).filter((r) => r.trim());
  const molecules: Molecule[] = [];
  let unread = 0;
  for (const record of records) {
    const lines = record.replace(/^\n+/, "").split("\n");
    const end = lines.findIndex((l) => l.startsWith("M  END"));
    const header = lines[3] ?? "";
    const name = lines[0] ?? "";
    const molecule = /V3000/.test(header) ? parseV3000(lines, name) : /V2000/.test(header) || /^\s*\d+\s+\d+/.test(header) ? parseV2000(lines, name) : undefined;
    if (!molecule) {
      unread++;
      continue;
    }
    molecule.data = end >= 0 ? dataItems(lines.slice(end + 1)) : [];
    molecules.push(molecule);
    if (molecules.length === MAX_CHEM_ROWS) break;
  }
  const text = molecules.map((m, i) => moleculeText(m, i + 1, molecules.length)).join("\n\n");
  const warnings = [
    ...(!molecules.length ? ["This file has no structure Kovrune can read."] : []),
    ...(unread && molecules.length ? [`${unread} of the ${records.length} records in this file could not be read.`] : []),
    ...(records.length > MAX_CHEM_ROWS ? [`Only the first ${MAX_CHEM_ROWS} structures in this file were read.`] : []),
  ];
  return { text, ...(warnings.length ? { warning: warnings.join(" ") } : {}) };
}

// ---------------------------------------------------------------------------------------------
// JCAMP-DX

/** A label in one form, as the standard compares them: upper case, without spaces, dashes, slashes and underscores. */
const ldrKey = (label: string) => label.toUpperCase().replace(/[\s\-/_]/g, "");

/** Labels written as their meaning, for the header lines most spectra have. */
const LABELS: Record<string, string> = {
  TITLE: "Title", JCAMPDX: "JCAMP-DX version", DATATYPE: "Data type", DATACLASS: "Data class", ORIGIN: "Origin", OWNER: "Owner",
  DATE: "Date", LONGDATE: "Date", TIME: "Time", SOURCEREFERENCE: "Source reference", CROSSREFERENCE: "Cross reference",
  SPECTROMETERDATASYSTEM: "Spectrometer", INSTRUMENTPARAMETERS: "Instrument parameters", SAMPLEDESCRIPTION: "Sample", CASNAME: "CAS name",
  NAMES: "Names", MOLFORM: "Molecular formula", CASREGISTRYNO: "CAS registry number", WISWESSER: "Wiswesser notation", BEILSTEINLAWSONNO: "Beilstein number",
  MP: "Melting point", BP: "Boiling point", DENSITY: "Density", REFRACTIVEINDEX: "Refractive index", MW: "Molecular weight",
  CONCENTRATIONS: "Concentrations", STATE: "State", PATHLENGTH: "Path length", PRESSURE: "Pressure", TEMPERATURE: "Temperature",
  SAMPLINGPROCEDURE: "Sampling procedure", DATAPROCESSING: "Data processing", RESOLUTION: "Resolution", XUNITS: "X units", YUNITS: "Y units",
  XLABEL: "X label", YLABEL: "Y label", FIRSTX: "First X", LASTX: "Last X", FIRSTY: "First Y", MAXX: "Largest X", MINX: "Smallest X",
  MAXY: "Largest Y", MINY: "Smallest Y", NPOINTS: "Points", XFACTOR: "X factor", YFACTOR: "Y factor", DELTAX: "X step",
  ".OBSERVEFREQUENCY": "Observe frequency (MHz)", ".OBSERVENUCLEUS": "Observe nucleus", ".SOLVENTNAME": "Solvent", ".SHIFTREFERENCE": "Shift reference",
  ".SOLVENTREFERENCE": "Solvent reference", ".ACQUISITIONMODE": "Acquisition mode", ".DIGITISERRES": "Digitiser resolution", ".PULSESEQUENCE": "Pulse sequence",
  ".SPECTROMETERTYPE": "Spectrometer type", ".INLET": "Inlet", ".IONIZATIONMODE": "Ionization mode", ".IONIZATIONENERGY": "Ionization energy",
  COMMENTS: "Comments", "": "Comment",
};

/** Header lines left out: the data tables (their points), and the lines that only frame them. */
const DATA_LABELS = new Set(["XYDATA", "XYPOINTS", "PEAKTABLE", "PEAKASSIGNMENTS", "DATATABLE", "RADATA", "XYPAIRS", "END", "NTUPLES", "VARNAME", "SYMBOL", "VARTYPE", "VARFORM", "VARDIM", "UNITS", "FIRST", "LAST", "MIN", "MAX", "FACTOR", "PAGE", "POSITION", "BLOCKS", "BLOCKID", "ENDNTUPLES"]);

interface Ldr {
  key: string;
  label: string;
  value: string;
}

/** A block's labelled data records: "##LABEL= value", the value running on over the lines up to the next "##". Comments ("$$") are dropped. */
function ldrs(raw: string): Ldr[] {
  const out: Ldr[] = [];
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const text = line.replace(/\$\$.*$/, "");
    const head = /^\s*##([^=]*)=(.*)$/.exec(text);
    if (head) out.push({ key: ldrKey(head[1]!), label: head[1]!.trim(), value: head[2]!.trim() });
    else if (out.length && text.trim()) out.at(-1)!.value += `\n${text.trim()}`;
  }
  return out;
}

/** A peak table's rows: "(XY..XY)" pairs, or "(XYW..XYW)" and "(XYM..XYM)" triples, separated by spaces, commas or semicolons. */
function peakRows(value: string): { header: string[]; rows: string[][] } | undefined {
  const form = /^\(\s*(XYW|XYM|XY)\s*\.\.\s*\1\s*\)/i.exec(value);
  if (!form) return undefined;
  const width = form[1]!.length;
  // Groups are "x,y" or "x, y" pairs (or triples) separated by spaces or ";": read as numbers one after another.
  const numbers = value.slice(form[0].length).split(/[\s,;]+/).filter(Boolean);
  if (!numbers.every((v) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(v))) return undefined;
  const rows: string[][] = [];
  for (let i = 0; i + width <= numbers.length; i += width) rows.push(numbers.slice(i, i + width));
  return { header: ["X", "Y", width === 3 ? (form[1]!.toUpperCase() === "XYW" ? "Width" : "Multiplicity") : ""].filter(Boolean), rows };
}

function blockText(block: Ldr[], level: number): string {
  const lines: string[] = [];
  const title = block.find((l) => l.key === "TITLE")?.value.split("\n")[0]?.trim();
  lines.push(`${"#".repeat(level)} ${title || "Spectrum"}`);
  const get = (key: string) => block.find((l) => l.key === key)?.value.trim();
  for (const ldr of block) {
    if (ldr.key === "TITLE" || DATA_LABELS.has(ldr.key) || !ldr.value) continue;
    const name = LABELS[ldr.key] ?? ldr.label.replace(/^[.$]/, "");
    lines.push(`${name}: ${ldr.value.replace(/\n/g, " ")}`);
  }
  const xydata = block.find((l) => l.key === "XYDATA" || l.key === "XYPOINTS" || l.key === "DATATABLE");
  if (xydata) {
    const points = get("NPOINTS");
    const units = get("XUNITS");
    const from = get("FIRSTX");
    const to = get("LASTX");
    const range = from && to ? ` from ${from} to ${to}${units ? ` ${units}` : ""}` : "";
    lines.push(`Spectrum: ${points ? `${points} points` : "points"}${range}. The points are not written here; Kovrune reads a spectrum's header and peak table only.`);
  }
  const peaks = block.find((l) => l.key === "PEAKTABLE");
  const table_ = peaks && peakRows(peaks.value);
  if (table_ && table_.rows.length) {
    const rows = table_.rows.slice(0, MAX_CHEM_ROWS);
    lines.push(`Peak table (${table_.rows.length} peaks):`);
    lines.push(table(table_.header, rows));
  }
  return lines.join("\n");
}

/**
 * A JCAMP-DX file as text: each block (a compound file has several, one per spectrum) its title as a
 * heading and its header lines with their meaning ("X units: 1/CM", "Observe frequency (MHz): 400.13"),
 * the number and range of its points, and its peak table, when it has one.
 */
export function readJcamp(raw: string): ChemText {
  const all = ldrs(raw);
  if (!all.some((l) => l.key === "TITLE" || l.key === "JCAMPDX")) return { text: "", warning: "This file has no JCAMP-DX data." };
  // Blocks start at a TITLE; a compound file's first block (with BLOCKS) holds the others.
  const blocks: Ldr[][] = [];
  for (const ldr of all) {
    if (ldr.key === "TITLE" || !blocks.length) blocks.push([]);
    blocks.at(-1)!.push(ldr);
  }
  const compound = blocks.length > 1;
  const text = blocks.map((block, i) => blockText(block, compound && i > 0 ? 2 : 1)).join("\n\n");
  return { text };
}
