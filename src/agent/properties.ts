// Which property a value is given to (harness 0.109.0; docs/materials-science-audit.md, MS1). Materials papers
// give many properties side by side in the same units: yield strength, tensile strength and fatigue limit in
// MPa, hardness and modulus in GPa, Tg and Tm in °C, Voc in V, efficiencies in %. A sentence that gives one
// property the other's value has the quote's number and unit, and every word but one, so no other check sees it:
// "a yield strength of 950 MPa" passed for "a yield strength of 880 MPa and an ultimate tensile strength of 950
// MPa", as did hardness for modulus, Tg for Tm, Jsc for Voc, porosity for density and remanence for saturation
// magnetization, all ten of the audit's cases.
//
// Here each value is tied to the property named just before it in its clause ("yield strength of 880 MPa", "a
// Voc of 1.18 V", "Tg: 105 °C"), or, with none there, just after it ("98% relative density", "99.5% Coulombic
// efficiency"). A sentence that ties a value to a property is not backed by quotes that tie that value only to
// other properties of the list. As support.ts's percentOf does for "92% ee" and "92% yield", which this
// generalizes. A value the quotes give with no property named (a table cell, "880 and 950 MPa") backs any.

import { numbers } from "./support.ts";

/**
 * The properties, each with the ways papers name it. Matched in a text without case, except the symbols in
 * SYMBOLS, whose case is their meaning ("Ms" is a magnetization, "ms" a millisecond).
 */
const PROPERTIES: Array<[id: string, names: string[]]> = [
  ["yield strength", ["yield strength", "yield stress", "proof stress", "proof strength", "ys", "σy", "σ_y", "rp0.2"]],
  ["tensile strength", ["ultimate tensile strength", "tensile strength", "uts", "σuts", "rm"]],
  ["compressive strength", ["compressive strength", "compressive yield strength"]],
  ["flexural strength", ["flexural strength", "bending strength", "modulus of rupture"]],
  ["fatigue limit", ["fatigue limit", "fatigue strength", "endurance limit"]],
  ["elongation", ["elongation", "elongation to failure", "elongation at break", "strain to failure", "fracture strain"]],
  ["hardness", ["hardness", "microhardness", "nanohardness", "vickers hardness", "brinell hardness"]],
  ["elastic modulus", ["elastic modulus", "young's modulus", "youngs modulus", "young modulus", "modulus of elasticity", "reduced modulus", "storage modulus"]],
  ["shear modulus", ["shear modulus"]],
  ["bulk modulus", ["bulk modulus"]],
  ["fracture toughness", ["fracture toughness", "toughness", "kic", "k_ic", "k1c"]],
  ["porosity", ["porosity"]],
  ["density", ["relative density", "density", "bulk density", "theoretical density"]],
  ["glass transition", ["glass transition temperature", "glass transition", "glass-transition temperature", "tg"]],
  ["melting", ["melting temperature", "melting point", "melting", "melted", "tm"]],
  ["crystallization", ["crystallization temperature", "crystallisation temperature", "cold crystallization"]],
  ["curie temperature", ["curie temperature", "curie point"]],
  ["open-circuit voltage", ["open-circuit voltage", "open circuit voltage", "voc", "v_oc"]],
  ["short-circuit current", ["short-circuit current density", "short-circuit current", "short circuit current", "jsc", "j_sc"]],
  ["fill factor", ["fill factor", "ff"]],
  ["power conversion efficiency", ["power conversion efficiency", "pce"]],
  ["coulombic efficiency", ["coulombic efficiency", "ce"]],
  ["capacity retention", ["capacity retention", "retention"]],
  ["saturation magnetization", ["saturation magnetization", "saturation magnetisation"]],
  ["remanence", ["remanence", "remanent magnetization", "remanent magnetisation", "remanent"]],
  ["coercivity", ["coercivity", "coercive field", "coercive force"]],
  ["electron mobility", ["electron mobility"]],
  ["hole mobility", ["hole mobility"]],
  ["band gap", ["band gap", "bandgap", "optical gap"]],
  ["ionic conductivity", ["ionic conductivity"]],
  ["electronic conductivity", ["electronic conductivity", "electrical conductivity"]],
  ["thermal conductivity", ["thermal conductivity"]],
  ["overpotential", ["overpotential"]],
  ["tafel slope", ["tafel slope"]],
  ["grain size", ["grain size", "average grain size", "mean grain size"]],
];

/** Symbols whose case is their meaning, matched as written. */
const SYMBOLS: Array<[id: string, symbol: string]> = [
  ["saturation magnetization", "Ms"],
  ["remanence", "Mr"],
  ["coercivity", "Hc"],
  ["elastic modulus", "E"],
  ["band gap", "Eg"],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[- ]/g, "[- ]?");

/** One pattern for every name, longest first, so "ultimate tensile strength" is one name, not "tensile strength" in it. */
const NAMES = PROPERTIES.flatMap(([id, names]) => names.map((name) => [id, name] as const)).sort((a, b) => b[1].length - a[1].length);
const NAME_PATTERN = new RegExp(`(?<![\\p{L}\\p{Nd}])(?:${NAMES.map(([, n]) => `(${escape(n)})`).join("|")})(?![\\p{L}\\p{Nd}])`, "giu");
const SYMBOL_PATTERN = new RegExp(`(?<![\\p{L}\\p{Nd}])(?:${SYMBOLS.map(([, s]) => `(${s})`).join("|")})(?![\\p{L}\\p{Nd}])(?=\\s*(?:=|:|of|was|were|is|reached|values?|\\())`, "gu");

/** A number standing alone: not digits of a formula or a name ("Ti3C2", "HV10"), nor a unit's power ("cm−2"). */
const NUMBER = /(?<![\p{L}\p{Nd}.,^_])(?<!\p{L}[−-])[-−]?\p{Nd}+(?:[.,]\p{Nd}+)*(?![\p{Nd}])/gu;

/** Where a clause ends: a value after one of these is not tied to a property before it. */
const CLAUSE_END = /[;|\n]|\.(?:\s|$)/;
/** How far before a value its property may be named, in characters. */
const REACH = 80;

interface Mention {
  id: string;
  start: number;
  end: number;
}

function mentions(text: string): Mention[] {
  const found: Mention[] = [];
  for (const m of text.matchAll(NAME_PATTERN)) {
    const at = m.slice(1).findIndex(Boolean);
    found.push({ id: NAMES[at]![0], start: m.index, end: m.index + m[0].length });
  }
  for (const m of text.matchAll(SYMBOL_PATTERN)) {
    const at = m.slice(1).findIndex(Boolean);
    found.push({ id: SYMBOLS[at]![0], start: m.index, end: m.index + m[0].length });
  }
  return found.sort((a, b) => a.start - b.start);
}

/** The value of a number as written, in support.ts's form ("1,200" is 1200, "−40" is -40). */
const valueOf = (written: string) => numbers(written.replace(/^−/, "-"))[0] ?? written;

/**
 * A text's values and the properties they are given to, as "value" → properties, and the values given to none.
 * A value is tied to the one property named between it and the value or clause start before it, within REACH;
 * with two named there ("the YS and UTS were 880 and 950 MPa") it is tied to neither. With none, it is tied to a
 * property named right after it and its unit ("98% relative density").
 */
export function propertyValues(text: string): { tied: Map<string, Set<string>>; untied: Set<string> } {
  const flat = text.normalize("NFKC").replace(/\u2032/g, "'");
  const named = mentions(flat);
  const tied = new Map<string, Set<string>>();
  const untied = new Set<string>();
  let since = 0;
  for (const m of flat.matchAll(NUMBER)) {
    const start = m.index;
    const before = flat.slice(since, start);
    const clause = before.split(CLAUSE_END);
    const clauseStart = start - clause.at(-1)!.length;
    const window = named.filter((n) => n.start >= Math.max(since, clauseStart, start - REACH) && n.end <= start);
    let id = window.length === 1 ? window[0]!.id : undefined;
    if (!window.length) {
      // A property right after the value and its unit: "98% relative density", "185 mAh g−1 specific capacity".
      const rest = flat.slice(start + m[0].length);
      const unit = /^\s?(?:%|[\p{L}°µμΩ·/^−\-\d]+(?:\s[\p{L}°µμΩ·/^−\-\d]+)?)?\s+/u.exec(rest)?.[0] ?? (rest.startsWith(" ") ? " " : "");
      const after = named.find((n) => n.start === start + m[0].length + unit.length || n.start === start + m[0].length + 1);
      id = after?.id;
    }
    const value = valueOf(m[0]);
    if (id) tied.set(value, (tied.get(value) ?? new Set()).add(id));
    else untied.add(value);
    since = start + m[0].length;
  }
  return { tied, untied };
}

/** What the quotes tie their values to, made once for every sentence. */
export interface PropertyBacking {
  tied: Map<string, Set<string>>;
  untied: Set<string>;
}

export function propertyBacking(quotes: string[]): PropertyBacking {
  const tied = new Map<string, Set<string>>();
  const untied = new Set<string>();
  for (const quote of quotes) {
    const own = propertyValues(quote);
    for (const [value, ids] of own.tied) for (const id of ids) tied.set(value, (tied.get(value) ?? new Set()).add(id));
    for (const value of own.untied) untied.add(value);
  }
  return { tied, untied };
}

/**
 * Whether each value a sentence gives to a property is given to it by the quotes, or given there to no
 * property, or not given there at all (the number check reads that). A value the quotes give only to other
 * properties is not backed: "a yield strength of 950 MPa" when 950 MPa is the quote's tensile strength.
 */
export function propertiesBacked(text: string, backing: PropertyBacking): boolean {
  for (const [value, ids] of propertyValues(text).tied) {
    const quoted = backing.tied.get(value);
    if (!quoted || backing.untied.has(value)) continue;
    if ([...ids].some((id) => !quoted.has(id))) return false;
  }
  return true;
}
