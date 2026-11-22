// Materials science's exclusive descriptors (harness 0.109.0; docs/materials-science-audit.md, MS2 and MS6), read
// as chemistry.ts reads (R)/(S) and ortho/meta/para: a sentence that names one of a set is not backed by quotes
// that name only another. Kept apart from chemistry.ts so it imports nothing: chemistry.ts builds its list of
// descriptors from these when it loads.
//
// None of these was caught before: "a single bcc phase" passed for the quote's "a single fcc phase", "rutile
// TiO2" for "anatase TiO2", "in the zinc blende structure" for "wurtzite", "FAPbI3" for "MAPbI3", "Ti-4Al-6V"
// for "Ti-6Al-4V", "NCA" for "NMC811", "graphene oxide" for "reduced graphene oxide".

import { barsAsMinus, spacedSymbolsJoined } from "../documents/crystallography.ts";

export type Descriptor = [set: string, pattern: RegExp, value: (m: RegExpMatchArray) => string];

const lower = (m: RegExpMatchArray) => m[1]!.toLowerCase();

/** A Hermann–Mauguin space-group symbol: "Fm-3m", "Pm-3m", "I4/mmm", "P63/mmc", "Ia-3d", "R-3m", "P21/c", "Pnma". */
const SPACE_GROUP = /(?<![\p{L}\p{Nd}/-])([PIFCABR](?:-?[1-6]{1,2}(?:\/[mnabcde])?|[mnabcde])(?:-?[1-6]{1,2}|[mnabcde]|\/[mnabcde]){0,3})(?![\p{L}\p{Nd}/])/gu;

/** Whether a match of SPACE_GROUP is a symbol, not a word or an element: it has a digit, a minus or a slash, or is four letters ("Pnma"). */
const isSpaceGroup = (symbol: string) => (/[\d/-]/.test(symbol) && symbol.length >= 3) || /^[PIFCABR][mnabcde]{3}$/.test(symbol);

export const MATERIALS_DESCRIPTORS: Descriptor[] = [
  // Lattices, by their abbreviation or in words. "Cubic" after "face-centred" or "body-centred" is the lattice, not a crystal system.
  ["lattice", /(?<![\p{L}])(fcc|bcc|hcp|bct)(?![\p{L}])/giu, lower],
  ["lattice", /(?<![\p{L}])(face|body)[- ]cent(?:er|re)d[- ]cubic(?![\p{L}])/giu, (m) => (m[1]!.toLowerCase() === "face" ? "fcc" : "bcc")],
  ["lattice", /(?<![\p{L}])hexagonal[- ]close[- ]?packed(?![\p{L}])/giu, () => "hcp"],
  // Crystal systems, named as adjectives: "cubic LLZO", "the tetragonal phase".
  ["crystalsystem", /(?<![\p{L}])(?<!(?:cent(?:er|re)d|close)[- ])(cubic|tetragonal|orthorhombic|hexagonal|trigonal|rhombohedral|monoclinic|triclinic)(?![- ]?close)(?![\p{L}])/giu, (m) => (lower(m) === "rhombohedral" ? "trigonal" : lower(m))],
  // TiO2's polymorphs.
  ["tio2", /(?<![\p{L}])(anatase|rutile|brookite)(?![\p{L}])/giu, lower],
  // Steels' phases, as nouns or adjectives: "austenite", "fully austenitic".
  ["steelphase", /(?<![\p{L}])(austenit|ferrit|martensit|bainit|pearlit)(?:e|es|ic)(?![\p{L}])/giu, lower],
  // Zinc blende and wurtzite, the two structures of GaN, ZnS, ZnO and SiC; sphalerite is zinc blende.
  ["zincblende", /(?<![\p{L}])(wurtzite|zinc[- ]?blende|sphalerite)(?![\p{L}])/giu, (m) => (/wurtz/i.test(m[1]!) ? "wurtzite" : "zincblende")],
  // A superalloy's precipitates: γ′ (Ni3Al) and γ″ (Ni3Nb), written with primes, apostrophes or in words.
  ["gammaprime", /(?:γ|gamma)\s?(″|′′|''|double[- ]prime)/giu, () => "double"],
  ["gammaprime", /(?:γ|gamma)\s?(′|'|prime)(?!′|'|\s?double)/giu, () => "single"],
  // Raman bands of carbon: D, G and 2D.
  ["ramanband", /(?<![\p{L}\p{Nd}])(2D|D|G)[- ]band/gu, (m) => m[1]!],
  // What a sample was heated or kept in: "annealed in argon", "under vacuum", "an N2 atmosphere".
  ["atmosphere", /(?<![\p{L}])(?:in|under)\s+(?:flowing\s+|static\s+|an?\s+|pure\s+|dry\s+|ambient\s+)?(argon|air|nitrogen|vacuum|hydrogen|oxygen)(?![\p{L}])/giu, lower],
  ["atmosphere", /(?<![\p{L}])(argon|Ar|air|nitrogen|N2|oxygen|O2|hydrogen|H2)\s+atmosphere/gu, (m) => ({ ar: "argon", n2: "nitrogen", o2: "oxygen", h2: "hydrogen" })[m[1]!.toLowerCase()] ?? m[1]!.toLowerCase()],
  // Perovskites by their A-site cation: "MAPbI3", "FAPbI3", "CsPbBr3", "FA0.85MA0.15PbI3".
  ["perovskite", /(?<![\p{L}\p{Nd}])((?:MA|FA|PEA|BA|GA|EA|Cs|Rb)(?:[\d.]*(?:MA|FA|Cs|Rb)[\d.]*)*(?:Pb|Sn|Ge)(?:I|Br|Cl)[\w.()]*)(?![\p{L}\p{Nd}])/gu, (m) => m[1]!],
  // Alloy designations, elements with their amounts: "Ti-6Al-4V", "Ti-6Al-7Nb", "Al-25Ni".
  ["alloy", /(?<![\p{L}\p{Nd}-])([A-Z][a-z]?(?:-\d+(?:\.\d+)?[A-Z][a-z]?){2,})(?![\p{L}\p{Nd}])/gu, (m) => m[1]!],
  // Layered oxide cathodes by family: "NMC811" and "NCM811" are one, "NCA" another.
  ["cathode", /(?<![\p{L}\p{Nd}])(NMC|NCM|NCA|LCO|LMO|LNMO)(\d{3})?(?![\p{L}])/gu, (m) => `${m[1] === "NCM" ? "NMC" : m[1]}${m[2] ?? ""}`],
  // Graphene oxide, and graphene oxide reduced.
  ["graphene", /(?<![\p{L}])reduced\s+graphene\s+oxide(?![\p{L}])/giu, () => "rgo"],
  ["graphene", /(?<![\p{L}])(?:rGO|RGO)(?![\p{L}])/gu, () => "rgo"],
  ["graphene", /(?<![\p{L}])(?<!reduced\s)graphene\s+oxide(?![\p{L}])/giu, () => "go"],
  ["graphene", /(?<![\p{L}])GO(?![\p{L}])/gu, () => "go"],
];

/** A text's space groups, in one form: overbars as minus signs, spaced symbols joined ("F m -3 m" is "Fm-3m"). */
export function spaceGroups(text: string): string[] {
  const flat = spacedSymbolsJoined(barsAsMinus(text.normalize("NFC")), "").replace(/[−–]/g, "-");
  return [...flat.matchAll(SPACE_GROUP)].map((m) => m[1]!).filter(isSpaceGroup);
}
