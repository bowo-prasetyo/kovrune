// Chemical formulas written with mhchem and chemformula, as the PDF prints them (harness 0.93.0). Chemistry
// papers write a formula as \ce{CO2} (mhchem), \ch{CO2} (chemformula), and a quantity as \pu{25 kJ/mol}.
// The converter read \ce, \cee, \ch and \chemfig as a cedilla, a caron or a breve on their second letter
// (latex.ts, accents), so "\ce{CO2}" became "eCO2", "\ch{H2SO4}" "hH2SO4" and "\ce{Fe^3+}" "eFe^3+". Now:
// - digits after an element, a bracket or a group are subscripts ("CO₂", "[Ru(bpy)₃]²⁺"); digits at the start
//   are a coefficient ("2NH₃", "3 H₂");
// - a charge is a superscript, after "^" or at the end of a formula ("Fe³⁺", "HCOO⁻", "SO₄²⁻", "e⁻"), and an
//   oxidation state as a roman numeral is in brackets, as papers also write it ("Fe^{II}" is "Fe(II)");
// - an isotope's mass number is a superscript before it ("¹³C"); "*" and "." in a formula are "·" ("CuSO₄·5H₂O");
// - arrows are arrows ("→", "⇌", "↔", "←"), with their conditions in brackets ("→ (Δ)"), and a lone "^" or "v"
//   after a product is a gas or a precipitate ("↑", "↓");
// - \pu is a number and its unit as siunitx writes them: "25 kJ mol⁻¹" from "25 kJ.mol-1", "1.2 × 10³ K";
// - \chemfig draws a structure, which has no text, so it is left out.

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "−": "⁻" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋" };

/** Text as superscript characters when each has one, else "^(text)". A roman numeral is an oxidation state, "(II)". */
function superscript(text: string): string {
  const t = text.trim();
  if (/^[IVX]+$/.test(t) || t === "0") return `(${t})`;
  return [...t].every((c) => SUP[c]) ? [...t].map((c) => SUP[c]).join("") : `^(${t})`;
}

/** Text as subscript characters when each has one, else "_(text)". */
function subscript(text: string): string {
  const t = text.trim();
  if (/^\(.*\)$/.test(t)) return t;
  return [...t].every((c) => SUB[c]) ? [...t].map((c) => SUB[c]).join("") : `_(${t})`;
}

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

/** Arrows, longest first, as mhchem and chemformula write them. */
const ARROWS: Array<[string, string]> = [
  ["<=>>", "⇌"],
  ["<<=>", "⇌"],
  ["<-->", "⇄"],
  ["<=>", "⇌"],
  ["<->", "↔"],
  ["->", "→"],
  ["<-", "←"],
  ["<>", "⇌"],
  ["==", "="],
];

/** What follows "^" or "_": a {…} group, or a run of digits and signs (a single other character). */
function script(body: string, at: number): { text: string; end: number } {
  const g = group(body, at);
  if (g) return { text: g.body, end: g.end };
  const run = /^[0-9]+[+\-−]?|^[+\-−]|^[IVX]+(?![a-z])|^./.exec(body.slice(at));
  return { text: run?.[0] ?? "", end: at + (run?.[0].length ?? 0) };
}

/** One formula, written without spaces: "[Ru(bpy)3]^2+", "CuSO4*5H2O", "^{13}C", "Fe3+". */
function formula(token: string): string {
  let out = "";
  let i = 0;
  // A coefficient: digits (or a fraction) before the first letter, "2NH3", "1/2O2".
  const coefficient = /^(\d+(?:\/\d+)?|\d*\.\d+)(?=[A-Z([])/.exec(token);
  if (coefficient) {
    out += coefficient[1];
    i = coefficient[1]!.length;
  }
  // A monatomic ion's charge after digits, "Fe3+", "Cu2+": the digits are the charge, not a count.
  const ion = /^([A-Z][a-z]?)(\d+)([+\-−])$/.exec(token.slice(i));
  if (ion) return out + ion[1] + superscript(`${ion[2]}${ion[3]}`);
  let previous = "";
  while (i < token.length) {
    const c = token[i]!;
    if (c === "^") {
      const s = script(token, i + 1);
      out += superscript(s.text);
      i = s.end;
    } else if (c === "_") {
      const s = script(token, i + 1);
      out += subscript(s.text);
      i = s.end;
    } else if (/\d/.test(c) && /[A-Za-z)\]}]/.test(previous)) {
      const digits = /^\d+/.exec(token.slice(i))![0];
      out += subscript(digits);
      i += digits.length;
    } else if ((c === "+" || c === "-" || c === "−") && i === token.length - 1 && /[A-Za-z0-9)\]]/.test(previous)) {
      // A sign at the end of a formula is its charge: "HCOO-", "Na+", "e-".
      out += SUP[c];
      i++;
    } else if ((c === "*" || c === ".") && /[A-Za-z0-9)\]]/.test(previous) && /[A-Z0-9([]/.test(token[i + 1] ?? "")) {
      out += "·";
      i++;
    } else if (c === "#") {
      out += "≡";
      i++;
    } else if (c === "{" || c === "}") {
      i++;
    } else {
      out += c;
      i++;
    }
    previous = c === "{" || c === "}" ? previous : c;
  }
  return out;
}

/** The text of a \ce or \ch argument as the PDF prints it. */
export function chemistryText(body: string): string {
  // Math and commands inside are kept for the converter; conditions above an arrow are read too.
  const pieces: string[] = [];
  let i = 0;
  let token = "";
  // A lone "^" is a gas given off, a lone "v" a precipitate; anything else is a formula, or a plus.
  const flush = () => {
    if (token) pieces.push(token === "^" ? "↑" : token === "v" ? "↓" : formula(token));
    token = "";
  };
  while (i < body.length) {
    const c = body[i]!;
    if (c === "$") {
      const close = body.indexOf("$", i + 1);
      flush();
      pieces.push(close > i ? body.slice(i, close + 1) : body.slice(i));
      i = close > i ? close + 1 : body.length;
      continue;
    }
    if (c === "\\") {
      // A command, with its {…} argument kept as written: \alpha, \mu, \text{…}.
      const name = /^\\(?:[a-zA-Z]+|.)/.exec(body.slice(i))![0];
      token += name;
      i += name.length;
      continue;
    }
    // An arrow stands apart from the formulas around it, as mhchem asks.
    const arrow = token ? undefined : ARROWS.find(([written]) => body.startsWith(written, i));
    if (arrow) {
      flush();
      i += arrow[0].length;
      const conditions: string[] = [];
      for (let k = 0; k < 2; k++) {
        const opt = optional(body, i);
        if (!opt || (k === 0 && /\s/.test(body[i] ?? ""))) break;
        if (opt.body.trim()) conditions.push(chemistryText(opt.body).trim());
        i = opt.end;
      }
      pieces.push(conditions.length ? `${arrow[1]} (${conditions.join("; ")})` : arrow[1]);
      continue;
    }
    if (/\s/.test(c)) {
      flush();
      i++;
      continue;
    }
    if (c === "{") {
      // A group: text kept as written ("{text}"), or a script's argument inside a token.
      const g = group(body, i);
      if (!g) {
        i++;
        continue;
      }
      if (token) token += body.slice(i, g.end);
      else pieces.push(g.body);
      i = g.end;
      continue;
    }
    token += c;
    i++;
  }
  flush();
  return pieces.join(" ");
}

/** A \pu quantity: the number as siunitx writes it, and units apart, with powers as superscripts. */
export function physicalUnitText(body: string): string {
  const match = /^\s*([-+−]?[\d.,]+(?:\s*[eE]\s*[-+−]?\d+)?)?\s*(.*)$/s.exec(body)!;
  let number = match[1]?.replace(/\s+/g, "") ?? "";
  const power = /^([-+−]?[\d.,]+)[eE]([-+−]?\d+)$/.exec(number);
  if (power) number = `${power[1]} × 10${[...power[2]!].map((c) => SUP[c] ?? c).join("")}`;
  const unit = (match[2] ?? "")
    .trim()
    .split(/[\s.*·]+/)
    .filter(Boolean)
    .map((u) =>
      u
        .replace(/\^\{?([-+−]?\d+)\}?/, (_all, p: string) => [...p].map((c) => SUP[c] ?? c).join(""))
        .replace(/(?<=[A-Za-zμΩ°])([-−]?\d+)$/, (p) => [...p].map((c) => SUP[c] ?? c).join("")),
    )
    .join(" ");
  return [number.replace(/^-/, "−"), unit].filter(Boolean).join(" ");
}

/** Commands for formulas: mhchem's \ce (and its old \cee and \cf), and chemformula's \ch. */
const FORMULA = /\\(ce|cee|cf|ch|pu|chemfig)(?![a-zA-Z])\*?/g;

/** Text with each mhchem and chemformula command written as the PDF prints it, and each \chemfig left out. */
export function mhchemToText(text: string): string {
  if (!/\\(?:ce|cee|cf|ch|pu|chemfig)(?![a-zA-Z])/.test(text)) return text;
  let out = "";
  let last = 0;
  FORMULA.lastIndex = 0;
  for (let m = FORMULA.exec(text); m; m = FORMULA.exec(text)) {
    let at = m.index + m[0].length;
    const opt = optional(text, at);
    if (opt) at = opt.end;
    const g = group(text, at);
    if (!g) continue;
    const written = m[1] === "chemfig" ? "" : m[1] === "pu" ? physicalUnitText(g.body) : chemistryText(g.body);
    out += text.slice(last, m.index) + written;
    last = g.end;
    FORMULA.lastIndex = g.end;
  }
  return out + text.slice(last);
}
