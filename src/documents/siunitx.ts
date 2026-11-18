// Quantities written with siunitx and hepunits, as the PDF prints them (harness 0.90.0). Physics papers
// write a value with its unit as \SI{1.5}{\milli\electronvolt} (siunitx 2), \qty{1.5}{\milli\electronvolt}
// (siunitx 3) or 1.5\,\MeV (hepunits). The converter read any command it did not know as its argument's
// text, or nothing (latex.ts), so "a gap of \SI{1.5}{\milli\electronvolt} at \SI{300}{\milli\kelvin}"
// became "a gap of 1.5 at 300": every unit was lost, and the sentence check had none to compare. Now:
// - \SI and \qty are the number, a space and the unit: "1.5 meV"; \si and \unit are the unit: "m s⁻¹";
// - \num is the number as siunitx prints it: "0.52 ± 0.01" from "0.52 +- 0.01", "1.2 × 10⁻³" from
//   "1.2e-3", "3.2(4)" as written, "−5" with a minus sign;
// - ranges, lists and products as siunitx's defaults print them: "10 K to 20 K", "1 m, 2 m and 3 m",
//   "2 m × 3 m"; \ang as degrees, minutes and seconds;
// - a unit is its prefixes and symbols, with \per, \square, \cubic, \squared, \cubed, \tothe and \raiseto
//   as powers: "km s⁻¹ Mpc⁻¹", or "km/s/Mpc" when the paper sets per-mode to symbol; units the paper
//   declares with \DeclareSIUnit are its own symbols, and a unit command not known is its name, never
//   nothing;
// - hepunits' commands outside \si (\GeV, \invfb, \picobarn) are their symbols too, when the paper does
//   not define them itself (its own macros are expanded before this runs).

/** One {…} argument at `at` (after spaces), and where it ends. */
function group(text: string, at: number): { body: string; end: number } | undefined {
  let i = at;
  while (/\s/.test(text[i] ?? "")) i++;
  if (text[i] !== "{") return undefined;
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (c === "\\") j++;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return { body: text.slice(i + 1, j), end: j + 1 };
  }
  return undefined;
}

/** An optional […] argument at `at` (after spaces), and where it ends. */
function optional(text: string, at: number): { body: string; end: number } | undefined {
  let i = at;
  while (text[i] === " ") i++;
  if (text[i] !== "[") return undefined;
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") depth--;
    else if (text[j] === "]" && depth === 0) return { body: text.slice(i + 1, j), end: j + 1 };
  }
  return undefined;
}

const PREFIXES: Record<string, string> = {
  quecto: "q", ronto: "r", yocto: "y", zepto: "z", atto: "a", femto: "f", pico: "p", nano: "n", micro: "μ", milli: "m", centi: "c", deci: "d",
  deca: "da", deka: "da", hecto: "h", kilo: "k", mega: "M", giga: "G", tera: "T", peta: "P", exa: "E", zetta: "Z", yotta: "Y", ronna: "R", quetta: "Q",
  kibi: "Ki", mebi: "Mi", gibi: "Gi", tebi: "Ti", pebi: "Pi", exbi: "Ei", zebi: "Zi", yobi: "Yi",
};

/** siunitx's units, and the physics units papers declare most often (\parsec, \gauss), by command name. */
const UNITS: Record<string, string> = {
  ampere: "A", candela: "cd", kelvin: "K", kilogram: "kg", gram: "g", metre: "m", meter: "m", mole: "mol", second: "s",
  becquerel: "Bq", degreeCelsius: "°C", celsius: "°C", coulomb: "C", farad: "F", gray: "Gy", hertz: "Hz", henry: "H", joule: "J", katal: "kat",
  lumen: "lm", lux: "lx", newton: "N", ohm: "Ω", pascal: "Pa", radian: "rad", siemens: "S", sievert: "Sv", steradian: "sr", tesla: "T",
  volt: "V", watt: "W", weber: "Wb",
  day: "d", hectare: "ha", hour: "h", litre: "L", liter: "L", minute: "min", tonne: "t", arcminute: "′", arcsecond: "″", arcmin: "′", arcsec: "″", degree: "°",
  astronomicalunit: "au", bel: "B", dalton: "Da", decibel: "dB", electronvolt: "eV", neper: "Np", atomicmassunit: "u", percent: "%",
  angstrom: "Å", barn: "b", bar: "bar", knot: "kn", mmHg: "mmHg", nauticalmile: "M", gauss: "G", erg: "erg", parsec: "pc", lightyear: "ly",
  year: "yr", torr: "Torr", calorie: "cal", oersted: "Oe", jansky: "Jy", curie: "Ci", rad: "rad", rem: "rem", fermi: "fm", micron: "μm",
  bit: "bit", byte: "B", inch: "in", foot: "ft", mile: "mi", solarmass: "M☉", magnitude: "mag",
  // Natural units.
  clight: "c", electronmass: "mₑ", planckbar: "ℏ", elementarycharge: "e", bohr: "a₀", hartree: "Eₕ", speedoflight: "c",
};

/** siunitx's abbreviated units, read only inside a unit (\pm there is a picometre, \l a litre). */
const ABBREVIATIONS: Record<string, string> = {
  fg: "fg", pg: "pg", ng: "ng", ug: "μg", mg: "mg", g: "g", kg: "kg", amu: "u",
  pm: "pm", nm: "nm", um: "μm", mm: "mm", cm: "cm", dm: "dm", m: "m", km: "km",
  as: "as", fs: "fs", ps: "ps", ns: "ns", us: "μs", ms: "ms", s: "s",
  fmol: "fmol", pmol: "pmol", nmol: "nmol", umol: "μmol", mmol: "mmol", mol: "mol", kmol: "kmol",
  pA: "pA", nA: "nA", uA: "μA", mA: "mA", A: "A", kA: "kA",
  ul: "μl", ml: "ml", l: "l", hl: "hl", uL: "μL", mL: "mL", L: "L", hL: "hL",
  mHz: "mHz", Hz: "Hz", kHz: "kHz", MHz: "MHz", GHz: "GHz", THz: "THz",
  mN: "mN", N: "N", kN: "kN", MN: "MN",
  Pa: "Pa", kPa: "kPa", MPa: "MPa", GPa: "GPa",
  mohm: "mΩ", kohm: "kΩ", Mohm: "MΩ",
  pV: "pV", nV: "nV", uV: "μV", mV: "mV", V: "V", kV: "kV",
  W: "W", nW: "nW", uW: "μW", mW: "mW", kW: "kW", MW: "MW", GW: "GW",
  J: "J", uJ: "μJ", mJ: "mJ", kJ: "kJ",
  eV: "eV", meV: "meV", keV: "keV", MeV: "MeV", GeV: "GeV", TeV: "TeV", kWh: "kWh",
  F: "F", fF: "fF", pF: "pF", nF: "nF", uF: "μF", mF: "mF",
  H: "H", mH: "mH", uH: "μH", nH: "nH",
  K: "K", mK: "mK", dB: "dB",
  // Symbols written as commands in a literal unit.
  mu: "μ", micro: "μ", Omega: "Ω", AA: "Å", circ: "°", hbar: "ℏ", odot: "☉", sun: "☉",
};

/**
 * hepunits' commands and siunitx's abbreviations that mean only a unit, read anywhere in the text: a paper
 * that loads hepunits writes "125\,\GeV" and "139\,\invfb". Those that are also LaTeX's own commands or
 * accents (\pm, \l, \H, \c, \S, \u) or short enough to be a paper's own variable (\m, \s, \g) are left
 * out; a paper's own macros of these names are expanded before this runs, so its definition wins.
 */
const HEP_UNITS: Record<string, string> = {
  eV: "eV", meV: "meV", keV: "keV", MeV: "MeV", GeV: "GeV", TeV: "TeV", PeV: "PeV", EeV: "EeV",
  MeVc: "MeV/c", GeVc: "GeV/c", TeVc: "TeV/c", MeVcc: "MeV/c²", GeVcc: "GeV/c²", TeVcc: "TeV/c²",
  MeVoverc: "MeV/c", GeVoverc: "GeV/c", TeVoverc: "TeV/c", MeVovercsq: "MeV/c²", GeVovercsq: "GeV/c²", TeVovercsq: "TeV/c²",
  barn: "b", millibarn: "mb", microbarn: "μb", nanobarn: "nb", picobarn: "pb", femtobarn: "fb", attobarn: "ab",
  mb: "mb", mub: "μb", nb: "nb", pb: "pb", fb: "fb",
  invbarn: "b⁻¹", invmb: "mb⁻¹", invmub: "μb⁻¹", invnb: "nb⁻¹", invpb: "pb⁻¹", invfb: "fb⁻¹", invab: "ab⁻¹",
  invmillibarn: "mb⁻¹", invmicrobarn: "μb⁻¹", invnanobarn: "nb⁻¹", invpicobarn: "pb⁻¹", invfemtobarn: "fb⁻¹", invattobarn: "ab⁻¹",
  mHz: "mHz", kHz: "kHz", MHz: "MHz", GHz: "GHz", THz: "THz",
  nm: "nm", um: "μm", mm: "mm", cm: "cm", km: "km", fm: "fm",
  ns: "ns", ps: "ps", fs: "fs", mK: "mK",
};

const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "+": "⁺", "−": "⁻" };

/** A power as a superscript: "-1" is "⁻¹", and "1" nothing unless `one` (10¹); one with other characters ("1/2") is "^(1/2)". */
function superscript(power: string, one = false): string {
  const p = power.replace(/[{}\s]/g, "");
  if (p === "1" && !one) return "";
  return [...p].every((c) => SUPERSCRIPT[c]) ? [...p].map((c) => SUPERSCRIPT[c]).join("") : `^(${p})`;
}

/** A power times a factor: "-1" × 2 is "-2"; one that is not a whole number is written as a product. */
function timesPower(power: string, factor: string): string {
  const a = Number(power);
  const b = Number(factor);
  if (Number.isInteger(a) && Number.isInteger(b)) return String(a * b);
  if (power === "1") return factor;
  return factor === "1" ? power : `${power}·${factor}`;
}

/** The settings a paper gives siunitx that change how units print: the per-mode ("symbol", "fraction"). */
export interface SiunitxSetup {
  /** Units the paper declares with \DeclareSIUnit, by command name. */
  units: Map<string, string>;
  /** Whether \per writes a "/" (per-mode=symbol or fraction) rather than a power of −1. */
  perSymbol: boolean;
}

/** The units a paper declares with \DeclareSIUnit, and its per-mode from \sisetup, read from its source and style files. */
export function siunitxSetup(sources: string[]): SiunitxSetup {
  const units = new Map<string, string>();
  let perSymbol = false;
  for (const text of sources) {
    const declare = /\\DeclareSIUnit\s*(?:\[[^\]]*\])?\s*(?:\{\s*\\([a-zA-Z]+)\s*\}|\\([a-zA-Z]+))/g;
    for (let m = declare.exec(text); m; m = declare.exec(text)) {
      const symbol = group(text, m.index + m[0].length);
      if (!symbol) continue;
      units.set((m[1] ?? m[2])!, symbol.body);
    }
    for (const m of text.matchAll(/\\sisetup\s*\{/g)) {
      const options = group(text, m.index + m[0].length - 1)?.body ?? "";
      const mode = /per-mode\s*=\s*([a-z-]+)/.exec(options)?.[1];
      if (mode) perSymbol = /symbol|fraction/.test(mode);
    }
  }
  // A declared unit's symbol may be written with units of its own: \DeclareSIUnit\kms{\kilo\metre\per\second}.
  for (const [name, symbol] of units) units.set(name, formatUnit(symbol, { units: new Map([...units].filter(([n]) => n !== name)), perSymbol }));
  return { units, perSymbol };
}

/** Options in a […] that change the per-mode for this one quantity. */
function localSetup(setup: SiunitxSetup, options: string | undefined): SiunitxSetup {
  const mode = options && /per-mode\s*=\s*([a-z-]+)/.exec(options)?.[1];
  return mode ? { ...setup, perSymbol: /symbol|fraction/.test(mode) } : setup;
}

const COMPARATORS: Array<[RegExp, string]> = [
  [/^\\(?:approx)(?![a-zA-Z])/, "≈"], [/^\\(?:sim)(?![a-zA-Z])/, "∼"], [/^\\(?:leq?|leqslant)(?![a-zA-Z])/, "≤"], [/^\\(?:geq?|geqslant)(?![a-zA-Z])/, "≥"],
  [/^\\(?:ll)(?![a-zA-Z])/, "≪"], [/^\\(?:gg)(?![a-zA-Z])/, "≫"], [/^\\(?:propto)(?![a-zA-Z])/, "∝"], [/^</, "<"], [/^>/, ">"], [/^=/, "="],
];

/** Whether an argument is a number siunitx would read: digits, signs, a decimal mark, an exponent, an uncertainty. */
export function looksLikeNumber(input: string): boolean {
  const s = input.replace(/\\(?:pm|mp|approx|sim|leq?|geq?|ll|gg|times|cdot|ldots|dots|,|;|!|\s)|[\s{}~]/g, "");
  return /\d/.test(s) && /^[-+<>=.,\d()eEdDiIjJx*/;:±]*$/.test(s.replace(/\\(?:approx|sim)/g, ""));
}

/** A real number as siunitx prints it: a minus sign, a decimal point, "0" before a leading point. */
function plain(number: string): string {
  let n = number.replace(/,/g, ".").replace(/^([-+]?)\./, "$10.");
  n = n.replace(/^-/, "−");
  return n;
}

/**
 * A number as siunitx prints it, with its default options: "0.52 +- 0.01" as "0.52 ± 0.01", "1.2e-3" as
 * "1.2 × 10⁻³", "-5" as "−5", "1,5" as "1.5", "3.2(4)" as written, "<1e-3" as "< 10⁻³" (with "1 ×"
 * kept as written: "< 1 × 10⁻³"). Digits are not grouped, so the number reads as one in the checks.
 */
export function formatNumber(input: string): string {
  let s = input.replace(/\\[,;:! ]|[\s~{}]/g, "");
  let comparator = "";
  for (const [pattern, symbol] of COMPARATORS) {
    const m = pattern.exec(s);
    if (m) {
      comparator = `${symbol} `;
      s = s.slice(m[0].length);
      break;
    }
  }
  s = s.replace(/\\pm(?![a-zA-Z])|\+-|±/g, "±").replace(/\\mp(?![a-zA-Z])|-\+/g, "∓").replace(/\\times(?![a-zA-Z])|\\cdot(?![a-zA-Z])/g, "×");
  const exp = /^(.*?)[eEdD]([-+]?\d+)$/.exec(s);
  let mantissa = exp ? exp[1]! : s;
  const power = exp ? exp[2]!.replace(/^\+/, "") : undefined;
  const parts = mantissa.split(/([±∓])/);
  mantissa = parts.map((p) => (p === "±" || p === "∓" ? ` ${p} ` : p ? plain(p) : p)).join("");
  if (power === undefined) return comparator + mantissa;
  const ten = `10${superscript(power, true)}`;
  if (!mantissa) return comparator + ten;
  return comparator + (/[±∓]/.test(mantissa) ? `(${mantissa}) × ${ten}` : `${mantissa} × ${ten}`);
}

interface Piece {
  symbol: string;
  power: string;
}

/**
 * A unit as siunitx prints it: prefixes joined to their units, powers as superscripts, units apart by a
 * space, and \per as a power of −1 ("km s⁻¹ Mpc⁻¹") or, with per-mode symbol, a "/" ("km/s/Mpc"). A unit
 * written as text ("GeV/c^2", "kg.m/s^2") keeps its text, with "." and "~" as the space between units
 * and "^" as a superscript. A command it does not know is its declared symbol, or its name.
 */
export function formatUnit(input: string, setup: SiunitxSetup): string {
  const pieces: Piece[] = [];
  let prefix = "";
  let per = false;
  let raise: string | undefined;
  let literal = "";
  const flushLiteral = () => {
    if (!literal.trim()) {
      literal = "";
      return;
    }
    for (const word of literal.trim().split(/[\s.~]+/)) {
      if (!word) continue;
      const powered = word.replace(/\^\s*\{?([-+−]?[\d./]+)\}?/g, (_all, p: string) => superscript(p)).replace(/_\{([^}]*)\}/g, "_$1");
      pieces.push({ symbol: prefix + powered, power: per ? "-1" : "1" });
      prefix = "";
      per = false;
    }
    literal = "";
  };
  const push = (symbol: string) => {
    flushLiteral();
    let power = raise ?? "1";
    raise = undefined;
    if (per) power = timesPower(power, "-1");
    pieces.push({ symbol: prefix + symbol, power });
    prefix = "";
    per = false;
  };
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === "\\") {
      const name = /^\\([a-zA-Z]+|.)/.exec(input.slice(i))![1]!;
      i += name.length + 1;
      // As in TeX, the spaces after a command's name are not text: "\mu m" is "μm".
      if (/^[a-zA-Z]/.test(name)) while (/\s/.test(input[i] ?? "")) i++;
      if (/^[,;:! ]$/.test(name)) {
        flushLiteral();
        continue;
      }
      if (name === "per") {
        flushLiteral();
        per = true;
      } else if (name === "square" || name === "cubic") {
        flushLiteral();
        raise = name === "square" ? "2" : "3";
      } else if (name === "squared" || name === "cubed") {
        flushLiteral();
        const last = pieces.at(-1);
        if (last) last.power = timesPower(last.power, name === "squared" ? "2" : "3");
      } else if (name === "tothe" || name === "raiseto") {
        flushLiteral();
        const arg = group(input, i);
        if (!arg) continue;
        i = arg.end;
        if (name === "raiseto") raise = arg.body.trim();
        else {
          const last = pieces.at(-1);
          if (last) last.power = timesPower(last.power, arg.body.trim());
        }
      } else if (name === "of") {
        flushLiteral();
        const arg = group(input, i);
        if (!arg) continue;
        i = arg.end;
        const last = pieces.at(-1);
        if (last) last.symbol += `(${arg.body.trim()})`;
      } else if (name === "highlight") {
        const arg = group(input, i);
        if (arg) i = arg.end;
      } else if (/^(?:cancel|mathrm|text|textrm|mathup|mathnormal|operatorname|ensuremath|mbox)$/.test(name)) {
        const arg = group(input, i);
        if (!arg) continue;
        i = arg.end;
        literal += formatUnit(arg.body, setup).replace(/\s+/g, "~");
      } else if (PREFIXES[name] !== undefined) {
        flushLiteral();
        prefix += PREFIXES[name];
      } else if (setup.units.has(name)) push(setup.units.get(name)!);
      else if (UNITS[name] !== undefined) push(UNITS[name]!);
      else if (ABBREVIATIONS[name] !== undefined) {
        // \mu and the like are symbols inside a written unit ("\mu m", "M_\odot"), not units of their own.
        if (/^(?:mu|Omega|AA|circ|hbar|odot|sun)$/.test(name) && (/^[a-zA-Z]/.test(input.slice(i)) || /_$/.test(literal))) literal = literal.replace(/_$/, "") + ABBREVIATIONS[name];
        else push(ABBREVIATIONS[name]!);
      } else push(name);
      continue;
    }
    if (c === "{" || c === "}") {
      i++;
      continue;
    }
    literal += c;
    i++;
  }
  flushLiteral();
  if (prefix) pieces.push({ symbol: prefix, power: "1" });
  if (!setup.perSymbol || !pieces.some((p) => p.power.startsWith("-"))) return pieces.map((p) => p.symbol + superscript(p.power)).join(" ");
  const over = pieces.filter((p) => !p.power.startsWith("-"));
  const under = pieces.filter((p) => p.power.startsWith("-")).map((p) => p.symbol + superscript(p.power.slice(1)));
  const top = over.length ? over.map((p) => p.symbol + superscript(p.power)).join(" ") : "1";
  return `${top}/${under.length > 1 ? `(${under.join(" ")})` : under[0]}`;
}

/** A number and its unit, apart by a space, but a degree, minute, second or percent sign joined: "12.5°", "10%". */
function quantity(number: string, unit: string): string {
  if (!unit) return number;
  if (!number) return unit;
  const shown = /[±∓]/.test(number) && !/^\(/.test(number) ? `(${number})` : number;
  return /^[°′″%]/.test(unit) ? `${shown}${unit}` : `${shown} ${unit}`;
}

/** Items of a list or range argument: "1;2;3" for lists, "1x2x3" for products. */
function items(arg: string, separator: RegExp): string[] {
  return arg.split(separator).map((s) => s.trim()).filter(Boolean);
}

/** "a", "a and b", "a, b and c": siunitx's default list separators. */
function listed(parts: string[]): string {
  return parts.length < 3 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** An angle as \ang prints it: "12.5°", or "1°2′3″" from "1;2;3". */
function angle(arg: string): string {
  const [d, m, s] = arg.split(";").map((p) => p.trim());
  return [d && `${formatNumber(d)}°`, m && `${formatNumber(m)}′`, s && `${formatNumber(s)}″`].filter(Boolean).join("");
}

type Reader = (args: string[], options: string | undefined, setup: SiunitxSetup) => string | undefined;

/**
 * The commands read, with how many {…} arguments each takes, and how each is written. \SI takes an
 * optional pre-unit between its number and unit ("\SI{10}[\$]{}"). A command whose number does not read
 * as one (\qty of the physics package, "\qty{\frac{a}{b}}") is left to the rest of the converter.
 */
const COMMANDS: Record<string, { args: number; read: Reader }> = {
  SI: { args: 2, read: ([n, u], o, s) => (looksLikeNumber(n!) ? quantity(formatNumber(n!), formatUnit(u!, localSetup(s, o))) : undefined) },
  qty: { args: 2, read: ([n, u], o, s) => (looksLikeNumber(n!) ? quantity(formatNumber(n!), formatUnit(u!, localSetup(s, o))) : undefined) },
  num: { args: 1, read: ([n]) => formatNumber(n!) },
  tablenum: { args: 1, read: ([n]) => formatNumber(n!) },
  si: { args: 1, read: ([u], o, s) => formatUnit(u!, localSetup(s, o)) },
  // siunitx 3's \unit, and the units package's \unit[value]{unit}.
  unit: { args: 1, read: ([u], o, s) => (o && looksLikeNumber(o) && !o.includes("=") ? quantity(formatNumber(o), formatUnit(u!, s)) : formatUnit(u!, localSetup(s, o))) },
  unitfrac: { args: 2, read: ([a, b], o, s) => quantity(o && looksLikeNumber(o) ? formatNumber(o) : "", `${formatUnit(a!, s)}/${formatUnit(b!, s)}`) },
  SIrange: { args: 3, read: ([a, b, u], o, s) => { const unit = formatUnit(u!, localSetup(s, o)); return `${quantity(formatNumber(a!), unit)} to ${quantity(formatNumber(b!), unit)}`; } },
  qtyrange: { args: 3, read: ([a, b, u], o, s) => { const unit = formatUnit(u!, localSetup(s, o)); return `${quantity(formatNumber(a!), unit)} to ${quantity(formatNumber(b!), unit)}`; } },
  numrange: { args: 2, read: ([a, b]) => `${formatNumber(a!)} to ${formatNumber(b!)}` },
  SIlist: { args: 2, read: ([l, u], o, s) => { const unit = formatUnit(u!, localSetup(s, o)); return listed(items(l!, /;/).map((n) => quantity(formatNumber(n), unit))); } },
  qtylist: { args: 2, read: ([l, u], o, s) => { const unit = formatUnit(u!, localSetup(s, o)); return listed(items(l!, /;/).map((n) => quantity(formatNumber(n), unit))); } },
  numlist: { args: 1, read: ([l]) => listed(items(l!, /;/).map(formatNumber)) },
  SIproduct: { args: 2, read: ([l, u], o, s) => { const unit = formatUnit(u!, localSetup(s, o)); return items(l!, /\s*[x×]\s*|\\times/).map((n) => quantity(formatNumber(n), unit)).join(" × "); } },
  qtyproduct: { args: 2, read: ([l, u], o, s) => { const unit = formatUnit(u!, localSetup(s, o)); return items(l!, /\s*[x×]\s*|\\times/).map((n) => quantity(formatNumber(n), unit)).join(" × "); } },
  numproduct: { args: 1, read: ([l]) => items(l!, /\s*[x×]\s*|\\times/).map(formatNumber).join(" × ") },
  ang: { args: 1, read: ([a]) => angle(a!) },
};

const COMMAND = new RegExp(String.raw`\\(${Object.keys(COMMANDS).join("|")})\*?(?![a-zA-Z])`, "g");
const HEP_COMMAND = new RegExp(String.raw`\\(${Object.keys(HEP_UNITS).join("|")})(?![a-zA-Z])(?:\s*\{\})?`, "g");

/** Text with each siunitx command written as the PDF prints it, and hepunits' unit commands as their symbols. */
export function siunitxToText(text: string, setup: SiunitxSetup): string {
  let out = "";
  let last = 0;
  COMMAND.lastIndex = 0;
  for (let m = COMMAND.exec(text); m; m = COMMAND.exec(text)) {
    const command = COMMANDS[m[1]!]!;
    let at = m.index + m[0].length;
    const opt = optional(text, at);
    if (opt) at = opt.end;
    const args: string[] = [];
    let pre = "";
    for (let k = 0; k < command.args; k++) {
      // \SI{10}[\$]{}: a pre-unit before the unit.
      if (m[1] === "SI" && k === 1) {
        const before = optional(text, at);
        if (before) (pre = before.body), (at = before.end);
      }
      const g = group(text, at);
      if (!g) break;
      args.push(g.body);
      at = g.end;
    }
    if (args.length < command.args) continue;
    const written = command.read(args, opt?.body, setup);
    if (written === undefined) continue;
    out += text.slice(last, m.index) + pre + written;
    last = at;
    COMMAND.lastIndex = at;
  }
  out += text.slice(last);
  return out.replace(HEP_COMMAND, (_all, name: string) => ` ${HEP_UNITS[name]}`);
}
