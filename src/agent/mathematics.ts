// Mathematics the answer checks read (harness 0.96.0). Two checks, from the mathematics suite's runs and the
// mathematician's audit (docs/math-audit.md, M3; eval/math/README.md):
//
// 1. An answer about another formula than the question's. Held-out task mah01 asks for the bound on Teller
//    sets in Z/pZ × F₅ⁿ; the answer gives the bound in F₅ⁿ, quoted word for word, and the model's check and
//    cross-check both confirmed it, so it was labelled "Quotes found" (harness 0.95.0). A question that names
//    a formula is answered by a passage about that formula: when neither the answer nor any verified quote
//    has it, the answer is not labelled (formulaOffQuestion). The completeness check would ask the model
//    the same, but it is measured only for Qwen3.5-2B: on Qwen3.5-4B it took the label from 23 right answers
//    to catch 1 wrong one (completeness.ts).
//
// 2. A formula, quantifier or status the quotes state otherwise (mathBacked). The sentence check compares
//    words and numbers, and passed every one of these with a real quote: "φ(n) ≥ φ(m)" for "φ(n) ≤ φ(m)",
//    "Re(s) ≥ 1" for "Re(s) > 1", "Im(s) > 1" for "Re(s) > 1", "O(n^{1/2})" for "O(n^{3/2})", "for every
//    constant c" for "there exists a constant c", and "the paper proves" what it conjectures.
//
// Each follows the rule of the opposites in support.ts and the names in chemistry.ts: a sentence may say what
// the quotes say, or what they say nothing of. It is marked only when the quotes say another thing of the
// same kind, and not this one.

import { mathMatchKey } from "../documents/math.ts";
import { normalizeForMatch } from "./evidence.ts";

/** Relations as words, read as their symbols before formulas are compared: "p is at least 7" is "p ≥ 7". */
const WORD_RELATIONS: Array<[RegExp, string]> = [
  [/\b(?:is |are )?at least\b/gi, " ≥ "],
  [/\b(?:is |are )?at most\b/gi, " ≤ "],
  [/\b(?:is |are )?(?:strictly )?(?:greater|larger|more) than\b/gi, " > "],
  [/\b(?:is |are )?(?:strictly )?(?:less|smaller|fewer) than\b/gi, " < "],
  [/\b(?:is |are )?(?:greater|larger) than or equal to\b/gi, " ≥ "],
  [/\b(?:is |are )?(?:less|smaller) than or equal to\b/gi, " ≤ "],
];

/** A text written for comparing formulas: relations in words as symbols, then mathMatchKey and normalizeForMatch. */
function formulaText(text: string): string {
  let out = text;
  // The longer phrases first, so "less than or equal to" is not read as "less than".
  for (const [pattern, symbol] of [...WORD_RELATIONS].reverse()) out = out.replace(pattern, symbol);
  return normalizeForMatch(mathMatchKey(out));
}

/**
 * Characters that make a token a formula: relations, set and arrow symbols, operators, scripts and LaTeX marks.
 * Not a Greek letter or an underscore alone, which names write too: "PPARα", "β3-adrenergic", "Q4_K_M".
 */
const FORMULA_CHAR = /[\\^=<>≤≥≠∈∉⊂⊃⊆⊇∩∪×⊗⊕·∘∑∏∫√∞∀∃→⇒⟨⟩\u00b2\u00b3\u00b9\u2070-\u209f]/u;
/** A token that is only an operator or relation, joining the formulas on either side: "×", "=", "≤", "−". */
const OPERATOR = /^[=<>≤≥≠∈∉⊂⊃⊆⊇∩∪×⊗⊕·∘+\-−→⇒]+$/u;
/** A variable or a small function: "k", "x1", "I(k)", "f(x)". */
const VARIABLE = /^(?:[A-Za-z]\d*|[A-Za-z]{1,3}\([^()\s]{1,8}\))$/;
/**
 * "a/b" as quotients and groups are written, short on one side: "Z/pZ", "Z/7Z", "1/n", "2Δ/kBTc"; not names
 * and pairs written with a slash, "CRISPR/Cas9", "ALK/MYCN", "TCP/IP", "and/or".
 */
const QUOTIENT = /^\(?(?:[\p{L}\p{N}]{1,2}\/[\p{L}\p{N}]+|[\p{L}\p{N}]+\/[\p{L}\p{N}]{1,2})\)?$/u;


/**
 * The formulas a question names: runs of formula tokens, joined by operators and variables ("Z/pZ × F_5^n",
 * "I(k) = k² − 2", "k ≥ 5"), each with at least one formula character or operator. A run of words or numbers
 * alone is not one.
 */
export function questionFormulas(question: string): string[] {
  const tokens = question.split(/\s+/).filter(Boolean);
  const kinds = tokens.map((raw) => {
    const t = raw.replace(/[?.,;:!]+$/, "");
    if (OPERATOR.test(t)) return "op";
    if (FORMULA_CHAR.test(t) || QUOTIENT.test(t)) return "formula";
    if (VARIABLE.test(t) || /^\d+(?:\.\d+)?$/.test(t)) return "part";
    return "word";
  });
  const spans: string[] = [];
  let start = -1;
  const close = (end: number) => {
    if (start < 0) return;
    let [s, e] = [start, end];
    while (s < e && kinds[s] === "op") s++;
    while (e > s && kinds[e - 1] === "op") e--;
    const run = kinds.slice(s, e);
    if (run.some((k) => k === "formula" || k === "op")) {
      const text = tokens.slice(s, e).join(" ").replace(/[?.,;:!]+$/, "");
      // A lone variable or number with nothing else is no formula: "k" in "for which k".
      if (run.length > 1 || run[0] === "formula") spans.push(text);
    }
    start = -1;
  };
  kinds.forEach((kind, i) => {
    if (kind === "word") close(i);
    else if (start < 0) start = i;
    // A run ends at a token that closes a clause: "for k = 3, and …".
    if (kind !== "word" && /[,;:?!]$/.test(tokens[i]!)) close(i + 1);
  });
  close(tokens.length);
  // An unbalanced bracket at an edge belongs to the sentence, not the formula: "(1/5" in "(1/5 + o(1))p".
  const balanced = (span: string) => {
    let out = span.trim();
    const count = (ch: string) => [...out].filter((c) => c === ch).length;
    if (out.startsWith("(") && count("(") > count(")")) out = out.slice(1);
    if (out.endsWith(")") && count(")") > count("(")) out = out.slice(0, -1);
    return out;
  };
  return [...new Set(spans.map(balanced).filter((s) => formulaText(s).replace(/\s/g, "").length >= 3))];
}

/** A relation or an operator between two things, in a formula as the question writes it. */
const RELATING = /[=<>≤≥≠∈∉⊂⊃⊆⊇∩∪×⊗⊕+·−]|\s-\s|\\(?:times|cdot|leq?|geq?|neq?|in|subseteq?|cap|cup|otimes|oplus)\b/;

/** Whether `key` is in `text` as a whole: not inside a longer number or name. */
function containsWhole(text: string, key: string): boolean {
  for (let at = text.indexOf(key); at >= 0; at = text.indexOf(key, at + 1)) {
    const before = text[at - 1];
    const after = text[at + key.length];
    const inside = (ch: string | undefined, edge: string | undefined) => ch !== undefined && edge !== undefined && /[\p{L}\p{N}]/u.test(ch) && /[\p{L}\p{N}]/u.test(edge);
    if (!inside(before, key[0]) && !inside(after, key.at(-1))) return true;
  }
  return false;
}

/**
 * A formula the question names that neither the answer nor any verified quote has, compared as math (so
 * "Z/pZ × F_5^n" is "$\mathbb{Z}/p\mathbb{Z} \times \mathbb{F}_5^n$"), or undefined when each is there. The
 * answer to mah01 quotes "every Teller set in F_5^n has at most 4.6812^n elements" for a question about
 * "Z/pZ × F_5^n", and has the question's formula nowhere.
 */
export function formulaOffQuestion(question: string, answer: string, quotes: string[]): string | undefined {
  // Only a formula relating or combining things is what a question asks about: "Z/pZ × F_5^n", "s ≤ 1/2",
  // "k = 3". One naming a single object ("F_5^n", "Z/pZ") sets the scene, and a right answer's quote need not
  // repeat it: mah08 asks whose bound "for Teller sets in F_5^n" the paper improves, and the right answer
  // quotes "The second bound improves the bound 4.8100^n of Kessler".
  const formulas = questionFormulas(question).filter((f) => RELATING.test(f));
  if (!formulas.length) return undefined;
  const sources = [answer, ...quotes].map(formulaText);
  return formulas.find((f) => {
    const key = formulaText(f);
    return !sources.some((s) => containsWhole(s, key));
  });
}

/** Relations, set relations and operators that state opposite or different things, by class, for the shape of a formula. */
const SHAPE_CLASSES: Array<[RegExp, string]> = [
  [/[≤≥<>=≠]/g, "R"],
  [/[⊂⊃⊆⊇]/g, "S"],
  [/[∩∪]/g, "U"],
  [/[∈∉]/g, "E"],
  [/[∀∃]/g, "Q"],
  [/\b(?:re|im)(?=\()/g, "F"],
  [/\b(?:max|min|sup|inf)\b/g, "M"],
  [/\p{N}+(?:\.\p{N}+)?/gu, "#"],
];

/** The formula tokens of a text as written for comparing: tokens with a relation, set or operator symbol, edges trimmed. */
function formulaTokens(text: string): string[] {
  return formulaText(text)
    .split(" ")
    .map((t) => t.replace(/^[.,;:?!'"]+|[.,;:?!'"]+$/g, ""))
    .filter((t) => /[≤≥<>=≠⊂⊃⊆⊇∩∪∈∉∀∃^/×·√∑∏∫]/u.test(t) && /[\p{L}\p{N}]/u.test(t));
}

/** A formula's shape: its relations, set operations, real and imaginary parts, extremes and numbers each by class. */
function shape(token: string): string {
  let out = token;
  for (const [pattern, mark] of SHAPE_CLASSES) out = out.replace(pattern, mark);
  return out;
}

/** Words for "every" and "there exists": a claim about all of something against one about some of it. */
const UNIVERSAL = /\b(?:every|for all|for each|for any)\b|∀/i;
const EXISTENTIAL = /\b(?:there (?:exists?|is|are)|exists?)\b|∃/i;
/** Words saying a statement is proved, and words saying it is only conjectured or open. */
const PROVED = /\b(?:prove[sdn]?|proving|proof|established|is a theorem)\b/i;
/** A proof denied: "we have no proof", "has not been proved", "unproven". It says the statement is not proved. */
const UNPROVED = /\b(?:no|without) proofs?\b|\bnot (?:yet )?(?:been )?prove[dn]\b|\bunproven\b/gi;
const CONJECTURED = /\b(?:conjectur(?:e|es|ed|al)|remains? open|open (?:problem|question)|is (?:not known|unknown)|(?:do|does) not know|(?:no|without) proofs?|not (?:yet )?(?:been )?prove[dn]|unproven)\b/i;
/** Whether a text says a statement is proved, not counting a proof it denies. */
const saysProved = (text: string) => PROVED.test(text.replace(UNPROVED, " "));

export interface MathBacking {
  /** The formula tokens of the quotes, as written for comparing. */
  formulas: Set<string>;
  /** The quotes' text as written for comparing, to find a formula inside a longer one. */
  text: string;
  /** Each formula shape in the quotes, with its tokens. */
  shapes: Map<string, Set<string>>;
  universal: boolean;
  existential: boolean;
  proved: boolean;
  conjectured: boolean;
}

/** What the quotes (and titles) say, for mathBacked. */
export function mathBacking(backing: string): MathBacking {
  const formulas = new Set(formulaTokens(backing));
  const shapes = new Map<string, Set<string>>();
  for (const token of formulas) shapes.set(shape(token), new Set([...(shapes.get(shape(token)) ?? []), token]));
  return {
    formulas,
    text: formulaText(backing),
    shapes,
    universal: UNIVERSAL.test(backing),
    existential: EXISTENTIAL.test(backing),
    proved: saysProved(backing),
    conjectured: CONJECTURED.test(backing),
  };
}

/**
 * Whether the mathematics a sentence states is what the quotes state, or of a kind they state nothing of:
 * - a formula no quote has, when a quote has one of the same shape (the same symbols, with the relations,
 *   set operations, extremes and numbers each standing for their kind): "φ(n)≥φ(m)" is not backed by
 *   "φ(n)≤φ(m)", "Re(s)≥1" by "Re(s)>1", "Im(s)>1" by "Re(s)>1", nor "O(n1/2logn)" by "O(n3/2logn)";
 * - "every" or "for all" when the quotes say only "there exists", and the reverse;
 * - "proves" when the quotes say only "conjectured" or "open", and the reverse.
 * A sentence stating both sides of a pair is not judged on it, as for the opposites of support.ts.
 */
export function mathBacked(text: string, backing: MathBacking): boolean {
  for (const token of formulaTokens(text)) {
    if (backing.formulas.has(token) || containsWhole(backing.text, token)) continue;
    const same = backing.shapes.get(shape(token));
    if (same?.size) return false;
  }
  const universal = UNIVERSAL.test(text);
  const existential = EXISTENTIAL.test(text);
  if (universal !== existential) {
    if (universal && backing.existential && !backing.universal) return false;
    if (existential && backing.universal && !backing.existential) return false;
  }
  const proved = saysProved(text);
  const conjectured = CONJECTURED.test(text);
  if (proved !== conjectured) {
    if (proved && backing.conjectured && !backing.proved) return false;
    if (conjectured && backing.proved && !backing.conjectured) return false;
  }
  return true;
}
