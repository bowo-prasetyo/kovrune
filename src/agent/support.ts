// Sentence support (issue #31): the evidence check proves a quote is in its source, not
// that it backs the answer. Small models add claims from memory next to real quotes, so
// each answer sentence is compared with the verified quotes, and sentences that share
// few words with them are marked. This is a word-overlap heuristic, not a proof.

import { words } from "../documents/scripts.ts";
import { stem } from "../tools/search.ts";
import { hasNegation, LITERAL_BREAKS, normalizeForMatch, quoteHas, type AnswerStatus, type CheckedEvidence } from "./evidence.ts";
import type { Completeness } from "./completeness.ts";
import type { CrossCheck } from "./crosscheck.ts";
import type { ReviewVerdict } from "./review.ts";

export interface AnswerSentence {
  /** The sentence as written, with the whitespace after it, so the sentences join back into the answer. */
  text: string;
  /** Whether a verified quote backs the sentence; undefined for fragments too short to judge, such as "Steps:". */
  backed?: boolean;
}

export interface SentenceSupport {
  sentences: AnswerSentence[];
  /** Sentences long enough to judge. */
  judged: number;
  backed: number;
  /**
   * True for an answer too short to judge that is backed another way: it is word for word in a
   * verified quote, and that quote, with its document's title, shares most of the question's words.
   */
  answerInQuote?: boolean;
  /**
   * The model's own check (review.ts), asked of answers the word checks would label "Quotes found"
   * and of answers too short for them to judge (reviewAsked): whether the quoted passages state what
   * the answer says. "unclear" when the check gave no readable reply; absent when not asked.
   */
  review?: ReviewVerdict;
  /**
   * The cross-check (crosscheck.ts), asked when the review says yes, for models it is measured for: the
   * answer the model read in the passages without seeing this one, and whether this one agrees with it.
   * Absent when not asked.
   */
  crossCheck?: CrossCheck;
  /**
   * The completeness check (completeness.ts), asked when the other checks confirm the answer, for models
   * it is measured for: the parts the question asks for, and whether the answer gives each. Absent when
   * not asked.
   */
  completeness?: Completeness;
}

/** Sentences with fewer content words than this are not judged. */
const MIN_JUDGED_WORDS = 3;
/** The share of a sentence's content words that must appear in the verified quotes for it to count as backed. */
export const MIN_BACKED_SHARE = 0.5;
/**
 * For an answer too short to judge, found in a quote: the share of the question's content words
 * that quote and its title must exceed. A bare answer ("2013年") makes no claim of its own, so
 * the question supplies the claim and the quote must cover it nearly all. In the 12 recorded
 * reports from harness 0.6.0 to 0.21.0, this labels 59 of the 162 right short answers and none
 * of the 74 wrong ones; at one half, 19 of the 143 answers it labelled were wrong. The nearest
 * miss: "Cobble", from a quote naming Harrow Labs, for "Who is the CEO of Harrow Labs?", covers
 * exactly two thirds.
 */
export const SHORT_ANSWER_QUESTION_SHARE = 2 / 3;
/**
 * The most words a quote may leave out in one place ("...") and still back a sentence. Leaving out an
 * aside ("Cobble, which ... never loses data") keeps the claim; leaving out more can join a subject to
 * another claim: "Cobble is released under ... the Apache-2.0 license" verifies against "Cobble is
 * released under the Business Source License 1.1, and each release converts to the Apache-2.0
 * license" (docs/ai-ml-audit.md, N3). Such a quote is still found and shown with the words it leaves
 * out, but backs no sentence.
 */
export const MAX_BACKING_ELIDED_WORDS = 5;

// Wider than the search's stop words: pronouns and auxiliaries say nothing about whether a quote backs a claim.
const STOP_WORDS = new Set(
  (
    "a about after all also an and any are as at be been before being but by can could did do does each for from had has have he her " +
    "here him his how i if in into is it its may me might more most must my no not of on one only or other our out over own she " +
    "should so some such than that the their them then there these they this those through to too under up us very was we were " +
    "what when where which while who whom why will with would you your"
  ).split(" "),
);

/** Words, without stop words, stemmed. In Chinese or Japanese, the pairs of neighbouring characters (scripts.ts). */
export function contentWords(text: string): string[] {
  return [...new Set(words(text.replace(LITERAL_BREAKS, " ")).filter((t) => t.length > 1 && !STOP_WORDS.has(t)).map(stem))];
}

/**
 * A number as written, in one form: without thousands separators ("4,096" and "21,196.18" are "4096"
 * and "21196.18"), and with a decimal comma as a point ("1,5", as French, German and other languages
 * write 1.5, is "1.5", so it does not pass for 15). A comma is a thousands separator when every group
 * after it has three digits, and a decimal comma when it is the only one and the number has no point.
 */
export function plainNumber(written: string): string {
  const groups = written.split(",");
  if (groups.length === 1 || groups.slice(1).every((group) => /^\p{Nd}{3}(?:\.\p{Nd}+)?$/u.test(group))) return groups.join("");
  return groups.length === 2 && !written.includes(".") ? groups.join(".") : groups.join("");
}

/** Superscript digits and signs, as papers print an exponent ("10⁻³"). */
const SUPERSCRIPTS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+" };

/** A number as numberText writes it: an optional sign, digits with "." or "," marks, and an exponent only in the form numberText gives. */
const NUMBER = String.raw`(?:(?<![^\s(\[{=≈<>~:;/])([-+±]))?(\p{Nd}+(?:[.,]\p{Nd}+)*(?:e[-+]\p{Nd}+)?)`;

/** A number written in powers of ten, as one plain number: "1.2e-3" and "1.2 × 10^-3" are both "0.0012". */
function powerOfTen(mantissa: string, exponent: string): string {
  const value = Number(`${plainNumber(mantissa)}e${exponent.replace(/\s+/g, "")}`);
  return Number.isFinite(value) ? String(value) : `${mantissa}e${exponent}`;
}

/**
 * A text made ready for reading its numbers and units (harness 0.67.0), as normalizeForMatch makes it
 * but with letters in their case, since "mW" is not "MW":
 * - a superscript exponent stays an exponent: "10⁻³" is 10^-3, where compatibility forms alone give
 *   "10-3", and "10⁶" gives "106";
 * - a minus sign standing apart from its number is joined to it: pdf.js gives "− 25 °C" for "−25 °C";
 * - powers of ten are written out, so "1.2 × 10^-3", "1.2×10⁻³", "1.2e-3" and "0.0012" are one number,
 *   and "10^-3" is not 10^3. A power after "×" needs "^" or a sign, so "4 × 10 mm" stays a size;
 * - a prefix the PDF set apart from its unit symbol is joined to it: "40 m Ω" is "40 mΩ", "° C" is "°C".
 */
function numberText(text: string): string {
  const raised = text
    .replace(/(\p{Nd})([⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/gu, (_, digit: string, power: string) => `${digit}^${[...power].map((c) => SUPERSCRIPTS[c]).join("")}`)
    .replace(/−\s+(?=\p{Nd})/gu, "−");
  return normalizeForMatch(raised, { keepCase: true })
    .replace(/^\d+[.)]\s+/, "")
    .replace(/(?<![\p{L}\p{Nd}.,])(\p{Nd}+(?:[.,]\p{Nd}+)?)\s*[×x*]\s*10\s*(?:\^\s*([-+]?\s?\p{Nd}+)|([-+]\s?\p{Nd}+))(?![\p{Nd}.])/gu, (_, m: string, a?: string, b?: string) => powerOfTen(m, (a ?? b)!))
    .replace(/(?<![\p{L}\p{Nd}.,^])10\s*\^\s*([-+]?\p{Nd}+)(?![\p{Nd}.])/gu, (_, e: string) => powerOfTen("1", e))
    .replace(/(?<![\p{L}\p{Nd}.,])(\p{Nd}+(?:\.\p{Nd}+)?)[eE]([-+]?\p{Nd}+)(?![\p{L}\p{Nd}])/gu, (_, m: string, e: string) => powerOfTen(m, e))
    .replace(/(\p{Nd}) ?([pnμmkMG]) (Ω)/gu, "$1 $2$3")
    .replace(/° ([CF])(?!\p{L})/gu, "°$1");
}

/** A signed number in one form: "-40" for "−40", "40" for "+40" and "±40", and plainNumber's digits. */
function signed(sign: string | undefined, digits: string): string {
  const plain = digits.includes("e") ? digits : plainNumber(digits);
  return sign === "-" && Number(plain) !== 0 ? `-${plain}` : plain;
}

/**
 * The numbers in a text (plainNumber), with their signs and powers of ten (numberText): "−40 °C" gives
 * "-40", which a sentence giving "40 °C" does not have, and "1.2 × 10^-3" gives "0.0012". A "-" after
 * a letter or a digit is a hyphen, not a sign: "LSA-2024-07", "61000-4-2" and "20-30" have none. A list
 * item's own number ("1. Open the perspective") is not one of them.
 */
export function numbers(text: string): string[] {
  return [...numberText(text).matchAll(new RegExp(NUMBER, "gu"))].map(([, sign, digits]) => signed(sign, digits!));
}

/**
 * Words saying a value went down, so a sentence may give the size of a change the quotes give as a
 * negative number: "efficiency fell by 3.2%" from "a change of −3.2%". Without one, "40 °C" is not
 * backed by "−40 °C". Only words for a change count: "the lowest temperature is 40 °C" is not "−40 °C".
 */
const FALL = /^(?:decrease[sd]?|decreasing|reduc(?:e[sd]?|ing|tions?)|lowered|fell|fall(?:s|ing)?|drop(?:s|ped|ping)?|declin(?:e[sd]?|ing)|loss(?:es)?|lost|minus|negative|cooled)$/;

/** Whether a text says something went down (FALL). */
export function saysFall(text: string): boolean {
  return words(normalizeForMatch(text)).some((w) => FALL.test(w));
}

/**
 * Whether a number is among others up to its sign, where the sign was left out for the size of a fall:
 * a positive number from a text that says the value fell ("fell by 3.2"), whose negative the others
 * have (−3.2); or a negative number whose size the others have, when their text says the value fell.
 * `ownFalls` and `othersFall` say whether the number's own text and the others' text say a fall (saysFall).
 */
export function signDropped(n: string, others: Set<string>, ownFalls: boolean, othersFall: boolean): boolean {
  if (n.startsWith("-")) return othersFall && others.has(n.slice(1));
  return ownFalls && others.has(`-${n}`);
}

/**
 * Whether a number in an answer sentence is backed: it is in a verified quote or a cited title,
 * or it restates the question's own number ("In Quillstate 2.0, …"), or it is the sum or the
 * difference of two quoted numbers, as answers to "by how much" give ("by 30,000" from 180,000
 * and 150,000). Only numbers within a factor of ten of each other are compared quantities, so
 * "2021" does not pass as 2024 minus version 3.0. Signs count (numbers), but a sentence saying a value
 * fell may give the size of a negative quoted number (signDropped).
 */
function numberCheck(quoted: string[], asked: string[], quotesFall: boolean): (n: string, sentenceFalls: boolean) => boolean {
  const known = new Set([...quoted, ...asked]);
  const values = [...new Set(quoted.map(Number).filter((v) => v > 0))];
  const comparable = (a: number, b: number) => a !== b && Math.max(a, b) <= 10 * Math.min(a, b);
  const derived = new Set(values.flatMap((a) => values.filter((b) => comparable(a, b)).flatMap((b) => [a + b, Math.abs(a - b)])));
  return (n, sentenceFalls) => known.has(n) || derived.has(Number(n)) || signDropped(n, known, sentenceFalls, quotesFall);
}

/** Month names and their usual short forms, by month number. */
const MONTHS: Array<[number, RegExp]> = [
  "jan(?:uary)?", "feb(?:ruary)?", "mar(?:ch)?", "apr(?:il)?", "may", "june?", "july?", "aug(?:ust)?", "sep(?:t(?:ember)?)?", "oct(?:ober)?", "nov(?:ember)?", "dec(?:ember)?",
].map((name, i) => [i + 1, new RegExp(`^${name}\\.?$`)]);

/**
 * The months a text names in a date: a month name next to a number, as in "March 2024", "3 May" or
 * "May 3, 2024", or a year and month in digits, as in "2024-07" (the advisory "LSA-2024-07"). A month
 * name alone is not counted: "may" is mostly a verb, "march" can be one.
 */
function datedMonths(text: string): number[] {
  const normalized = normalizeForMatch(text);
  const tokens = normalized.split(/[\s,]+/);
  const found = new Set<number>();
  for (const [, month] of normalized.matchAll(/(?<!\d)(?:19|20)\d{2}[-/.](0?[1-9]|1[0-2])(?!\d)/g)) found.add(Number(month));
  tokens.forEach((token, i) => {
    const month = MONTHS.find(([, pattern]) => pattern.test(token))?.[0];
    const nearNumber = [tokens[i - 1], tokens[i + 1]].some((t) => t !== undefined && /^\d{1,4}(?:st|nd|rd|th)?\.?$/.test(t));
    if (month && nearNumber) found.add(month);
  });
  return [...found];
}

/**
 * Engineering units (harness 0.67.0), where a wrong prefix or unit is a wrong value by a factor of a
 * thousand or more: "276 GPa" is not backed by "276 MPa", nor "600 kV" by "600 V", "15 W" by "15 mW",
 * "100 µF" by "100 nF", "20 dB" by "20 dBm", or "350 K" by "350 °C". Symbols are compared in their case,
 * since the prefix "m" is a thousandth and "M" a million ("mW", "MW"; "mPa·s" is a viscosity, "MPa" a
 * stress); a symbol in another case is not read as a unit at all, so it is left to the other checks.
 * Some symbols are left out because they are also common words or other units: "F" (farad or
 * Fahrenheit), "H" (henry, or hours as the "h" below), "S" (siemens or seconds), "T" (tesla), "us".
 * Only a unit's first word is compared, so "N·m" is "N" and "K/W" is "K".
 */
const ENGINEERING_UNITS: Array<[string, RegExp]> = [
  ["Pa", /^(?:Pa|pascals?)$/],
  ["hPa", /^hPa$/],
  ["kPa", /^(?:kPa|kilopascals?)$/],
  ["MPa", /^(?:MPa|megapascals?)$/],
  ["GPa", /^(?:GPa|gigapascals?)$/],
  ["mPa", /^mPa$/],
  ["bar", /^bar$/],
  ["mbar", /^mbar$/],
  ["psi", /^psi[ag]?$/],
  ["ksi", /^ksi$/],
  ["atm", /^atm$/],
  ["N", /^(?:N|newtons?)$/],
  ["kN", /^(?:kN|KN|kilonewtons?)$/],
  ["MN", /^(?:MN|meganewtons?)$/],
  ["N·m", /^Nm$/],
  ["lbf", /^lbf$/],
  ["V", /^(?:V|volts?)$/],
  ["mV", /^(?:mV|millivolts?)$/],
  ["μV", /^(?:μV|uV|microvolts?)$/],
  ["kV", /^(?:kV|KV|kilovolts?)$/],
  ["MV", /^(?:MV|megavolts?)$/],
  ["A", /^(?:A|amps?|amperes?)$/],
  ["mA", /^(?:mA|milliamps?|milliamperes?)$/],
  ["μA", /^(?:μA|uA|microamps?|microamperes?)$/],
  ["nA", /^(?:nA|nanoamps?|nanoamperes?)$/],
  ["kA", /^(?:kA|kiloamps?|kiloamperes?)$/],
  ["Ah", /^Ah$/],
  ["mAh", /^mAh$/],
  ["W", /^(?:W|watts?)$/],
  ["μW", /^(?:μW|uW|microwatts?)$/],
  ["mW", /^(?:mW|milliwatts?)$/],
  ["kW", /^(?:kW|KW|kilowatts?)$/],
  ["MW", /^(?:MW|megawatts?)$/],
  ["GW", /^(?:GW|gigawatts?)$/],
  ["Wh", /^Wh$/],
  ["kWh", /^(?:kWh|KWh)$/],
  ["MWh", /^MWh$/],
  ["GWh", /^GWh$/],
  ["J", /^(?:J|joules?)$/],
  ["mJ", /^(?:mJ|millijoules?)$/],
  ["kJ", /^(?:kJ|kilojoules?)$/],
  ["MJ", /^(?:MJ|megajoules?)$/],
  ["eV", /^eV$/],
  ["keV", /^keV$/],
  ["MeV", /^MeV$/],
  ["GeV", /^GeV$/],
  ["Hz", /^(?:Hz|hertz)$/],
  ["kHz", /^(?:kHz|KHz|khz|kilohertz)$/],
  ["MHz", /^(?:MHz|megahertz)$/],
  ["GHz", /^(?:GHz|ghz|gigahertz)$/],
  ["THz", /^(?:THz|terahertz)$/],
  ["rpm", /^(?:rpm|RPM)$/],
  ["Ω", /^(?:Ω|ohms?)$/],
  ["mΩ", /^(?:mΩ|milliohms?)$/],
  ["kΩ", /^(?:kΩ|KΩ|kilohms?|kiloohms?)$/],
  ["MΩ", /^(?:MΩ|megohms?|megaohms?)$/],
  ["pF", /^(?:pF|picofarads?)$/],
  ["nF", /^(?:nF|nanofarads?)$/],
  ["μF", /^(?:μF|uF|microfarads?)$/],
  ["mF", /^(?:mF|millifarads?)$/],
  ["nH", /^(?:nH|nanohenr(?:y|ies|ys))$/],
  ["μH", /^(?:μH|uH|microhenr(?:y|ies|ys))$/],
  ["mH", /^(?:mH|millihenr(?:y|ies|ys))$/],
  ["°C", /^(?:°C|celsius|Celsius)$/],
  ["°F", /^(?:°F|fahrenheit|Fahrenheit)$/],
  ["K", /^(?:K|kelvins?)$/],
  ["dB", /^(?:dB|db|decibels?)$/],
  ["dBm", /^(?:dBm|dbm)$/],
  ["dBi", /^(?:dBi|dbi)$/],
  ["dBc", /^(?:dBc|dbc)$/],
  ["dBA", /^dBA$/],
  ["dBW", /^dBW$/],
  ["dBV", /^dBV$/],
  ["μm", /^(?:μm|um|microns?|micromet(?:re|er)s?)$/],
  ["nm", /^(?:nm|nanomet(?:re|er)s?)$/],
  ["ns", /^(?:ns|nanoseconds?)$/],
  ["μs", /^(?:μs|microseconds?)$/],
];

/** Units, each with the spellings that mean it. Binary and decimal sizes are one unit: models write "4 KB" for "4 KiB". */
const UNITS: Array<[string, RegExp]> = [
  ["KB", /^(?:kb|kib|kilobytes?)$/],
  ["MB", /^(?:mb|mib|megabytes?)$/],
  ["GB", /^(?:gb|gib|gigabytes?)$/],
  ["TB", /^(?:tb|tib|terabytes?)$/],
  ["ms", /^(?:ms|milliseconds?)$/],
  ["s", /^(?:s|secs?|seconds?)$/],
  ["min", /^(?:mins?|minutes?)$/],
  ["h", /^(?:h|hrs?|hours?)$/],
  ["day", /^days?$/],
  ["week", /^weeks?$/],
  ["month", /^months?$/],
  ["year", /^(?:years?|yrs?)$/],
  ["%", /^(?:%|percent|per\s?cent)$/],
  ["km", /^(?:km|kilometres?|kilometers?)$/],
  ["m", /^(?:m|metres?|meters?)$/],
  ["token", /^tokens?$/],
  // Clinical units (harness 0.59.0), where a swapped unit is a wrong dose or a wrong reading: "500 mg"
  // is not backed by "500 µg", nor "7.2 mg/dL" by "7.2 mmol/L". Only the unit's first word is compared,
  // so "mg/kg" and "mg/day" are one unit here. "µ" is "μ" after normalizing (NFKC). Millimetres of
  // mercury are millimetres: sources write "120 mm Hg" and "120 mmHg" alike.
  ["mg", /^(?:mg|milligrams?)$/],
  ["μg", /^(?:μg|ug|mcg|micrograms?)$/],
  ["ng", /^(?:ng|nanograms?)$/],
  ["g", /^(?:g|grams?)$/],
  ["kg", /^(?:kg|kilograms?)$/],
  ["mL", /^(?:ml|millilit(?:re|er)s?)$/],
  ["L", /^(?:l|lit(?:re|er)s?)$/],
  ["mmol", /^(?:mmol|millimoles?)$/],
  ["μmol", /^(?:μmol|umol|micromoles?)$/],
  ["nmol", /^(?:nmol|nanomoles?)$/],
  ["mEq", /^meq$/],
  ["IU", /^(?:iu|ui)$/],
  ["mm", /^(?:mm|mmhg|millimet(?:re|er)s?)$/],
  ["cm", /^(?:cm|centimet(?:re|er)s?)$/],
  ["kcal", /^(?:kcal|kilocalories?)$/],
];

/** The unit a word after a number names: an engineering symbol in its own case, or another unit in any case. */
function unitOf(word: string): string | undefined {
  return ENGINEERING_UNITS.find(([, pattern]) => pattern.test(word))?.[0] ?? UNITS.find(([, pattern]) => pattern.test(word.toLowerCase()))?.[0];
}

/** Words that end what a negation before them reaches: "no change in A, but a significant fall in B". */
const CLAUSE_BREAK = /^(?:but|while|whereas|although|however|yet)$/;
/** Words that negate a statement of significance before it: "not significant", "did not reach statistical significance". */
const SIGNIFICANCE_NEGATOR = /^(?:not|no|never|neither|nor|without|cannot|fail\p{L}*|\p{L}+n't)$/u;
/** How many words before "significant" a negation may stand: "no statistically significant", "not differ significantly". */
const SIGNIFICANCE_REACH = 4;

/**
 * How a text speaks of statistical significance: whether it says something was significant
 * ("asserted"), and whether it says something was not ("negated": "no significant difference", "not
 * statistically significant", "nonsignificant", "did not reach significance"). A text can do both.
 */
export function significance(text: string): { asserted: boolean; negated: boolean } {
  const raw = normalizeForMatch(text).split(" ");
  const tokens = raw.map((t) => t.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ""));
  let asserted = false;
  let negated = false;
  tokens.forEach((token, i) => {
    if (!/significan/.test(token)) return;
    let isNegated = /^(?:non|in)significan/.test(token);
    for (let j = i - 1; !isNegated && j >= Math.max(0, i - SIGNIFICANCE_REACH); j--) {
      if (CLAUSE_BREAK.test(tokens[j]!) || /[,;:]$/.test(raw[j]!)) break;
      if (SIGNIFICANCE_NEGATOR.test(tokens[j]!)) isNegated = true;
    }
    if (isNegated) negated = true;
    else asserted = true;
  });
  return { asserted, negated };
}

/**
 * Words that state a direction, in pairs of opposites. A sentence that says one side is not backed by
 * quotes that say only the other: "mortality was higher" is not backed by "mortality was lower", which
 * shares every other word. A sentence the quotes say neither side of is left to the other checks, so
 * "lower risk" may still paraphrase "hazard ratio 0.82". A correct answer that turns a comparison round
 * ("higher in the control group" for "lower in the treated group") is marked too: it asks the reader to
 * check, which is the cheaper mistake.
 */
const OPPOSITES: Array<[string[], string[]]> = [
  [["higher", "highest"], ["lower", "lowest"]],
  [
    ["increase", "increased", "increases", "increasing"],
    ["decrease", "decreased", "decreases", "decreasing", "reduce", "reduced", "reduces", "reducing", "reduction", "reductions"],
  ],
  [["improve", "improved", "improves", "improving", "improvement", "improvements"], ["worsen", "worsened", "worsens", "worsening", "worse", "deteriorated", "deterioration"]],
  [["greater", "greatest", "larger", "largest"], ["smaller", "smallest"]],
  [["longer", "longest"], ["shorter", "shortest"]],
  [["gain", "gained", "gains"], ["loss", "losses", "lost"]],
  [["present"], ["absent"]],
  [["positive"], ["negative"]],
  [["superior"], ["inferior"]],
  [["above", "exceed", "exceeds", "exceeded", "exceeding"], ["below"]],
  // Engineering opposites (harness 0.67.0): a limit, a load, a flow or a test result read the wrong way round.
  [["maximum", "maxima"], ["minimum", "minima"]],
  [["tensile", "tension"], ["compressive", "compression"]],
  [["inlet"], ["outlet"]],
  [["upstream"], ["downstream"]],
  [["heating", "heated"], ["cooling", "cooled"]],
  [["charge", "charged", "charging"], ["discharge", "discharged", "discharging"]],
  [["leading"], ["lagging"]],
  [["faster", "fastest"], ["slower", "slowest"]],
  [["stronger", "strongest"], ["weaker", "weakest"]],
  [["pass", "passed", "passes"], ["fail", "failed", "fails"]],
  [["accepted"], ["rejected"]],
];

/**
 * Words saying how many people a study actually took in: "25 participants were recruited", "904 women
 * were enrolled and randomly assigned". Matched at the start of a word, so "recruited", "enrollment" and
 * "randomised" count.
 */
const ACTUAL_COUNT = /^(?:recruit|enrol|enroll|randomi[sz]|included|participated|underwent|took)/;
/**
 * Words that make a number a target, not a count, when they stand just before it: "a desired sample
 * size of 25 participants", "the planned 40 patients", "a target of 200 women".
 */
const PLANNED_BEFORE = /^(?:desired|planned|plan|target|targeted|intended|anticipated|required|needed|calculated|projected|aimed|aim|goal)$/;
/**
 * Words that make a number a target when they follow it as a verb: "25 participants was calculated",
 * "40 were required". Only after "was", "were" and the like, so "18 of the planned 25" stays a count.
 */
const PLANNED_AFTER = /^(?:calculated|required|needed|planned|targeted|intended|anticipated)$/;
/** How many words before a number, or after it, a planning word may stand and still describe it. */
const PLANNED_BEFORE_REACH = 5;
const PLANNED_AFTER_REACH = 3;

/** Whether a text says how many were recruited, enrolled, randomised or included, and not how many were planned. */
function saysActualCount(text: string): boolean {
  const said = words(normalizeForMatch(text));
  return said.some((w) => ACTUAL_COUNT.test(w)) && !said.some((w) => PLANNED_BEFORE.test(w) || PLANNED_AFTER.test(w));
}

/**
 * Whether a quote gives a number only as a target: every time the number appears, a planning word
 * stands just before it in the same clause ("a desired sample size of 25"), or follows it as a verb
 * ("25 … was calculated"). The words before are what describe a number; "18 of the planned 25 participants
 * were enrolled" gives 18 as a count and 25 as a target.
 */
function plannedOnly(n: string, quote: string): boolean {
  const tokens = normalizeForMatch(quote).split(" ");
  const bare = (t: string) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const ends = (t: string) => /[.;:,)(]$/.test(t);
  const at = tokens.flatMap((t, i) => (numbers(t).includes(n) ? [i] : []));
  if (!at.length) return false;
  return at.every((i) => {
    for (let j = i - 1; j >= Math.max(0, i - PLANNED_BEFORE_REACH); j--) {
      if (ends(tokens[j]!)) break;
      if (PLANNED_BEFORE.test(bare(tokens[j]!))) return true;
    }
    for (let j = i + 1; j <= Math.min(tokens.length - 1, i + PLANNED_AFTER_REACH); j++) {
      if (PLANNED_AFTER.test(bare(tokens[j]!)) && /^(?:was|were|is|are|be|been)$/.test(bare(tokens[j - 1]!))) return true;
      if (ends(tokens[j]!)) break;
    }
    return false;
  });
}

/**
 * Whether each number a sentence gives as a count of people recruited, enrolled or randomised is in some
 * quote as more than a target. "25 participants were recruited" is not backed by "a desired sample size
 * of 25 participants was calculated", when the trial recruited 18: both Qwen3.5 models answered so in
 * the clinical suite's 0.60.0 runs (c09), and both answers were labelled "Quotes found". A sentence
 * that says the number was planned ("the planned sample size was 25") is not a count, and passes.
 */
function countsBacked(text: string, quotes: string[]): boolean {
  if (!saysActualCount(text)) return true;
  return numbers(text).every((n) => {
    const giving = quotes.filter((q) => numbers(q).includes(n));
    return !giving.length || giving.some((q) => !plannedOnly(n, q));
  });
}

/**
 * The changes a text states "from" one number "to" another, as "from|to" keys of signed numbers:
 * "efficiency improved from 96.4% to 97.1%" gives "96.4|97.1". A unit or a word may follow the first
 * number ("from 150 ns to 90 ns", "from 20% load to 50% load" is not one: only one word).
 */
function changes(text: string): Set<string> {
  const found = new Set<string>();
  const pattern = new RegExp(`\\bfrom ${NUMBER}\\S*(?: (?!to\\b)\\S+)? to ${NUMBER}`, "gu");
  for (const [, s1, d1, s2, d2] of numberText(text).matchAll(pattern)) found.add(`${signed(s1, d1!)}|${signed(s2, d2!)}`);
  return found;
}

/**
 * Whether every change a sentence states from one number to another goes the way the quotes give it:
 * "efficiency improved from 97.1% to 96.4%" is not backed by "efficiency improved from 96.4% to 97.1%",
 * which has the same numbers and words. A change the quotes state only one way round is all that is
 * checked; one they do not state at all is left to the number check.
 */
function changesBacked(text: string, quoted: Set<string>): boolean {
  return [...changes(text)].every((key) => {
    const [from, to] = key.split("|");
    return quoted.has(key) || !quoted.has(`${to}|${from}`);
  });
}

/** The sides of OPPOSITES a text says, as "pair:side" keys. */
function directions(text: string): Set<string> {
  const said = new Set(words(normalizeForMatch(text)));
  const found = new Set<string>();
  OPPOSITES.forEach((pair, i) => pair.forEach((side, s) => side.some((w) => said.has(w)) && found.add(`${i}:${s}`)));
  return found;
}

/** Whether every direction a sentence states is one the quotes state, or one they state neither side of. */
function directionsBacked(text: string, quoted: Set<string>): boolean {
  return [...directions(text)].every((key) => {
    const [pair, side] = key.split(":");
    return quoted.has(key) || !quoted.has(`${pair}:${side === "0" ? 1 : 0}`);
  });
}

/**
 * The units a text gives its numbers, as "number unit" pairs ("8 GB" is "8 GB"; "4,096 tokens" is
 * "4096 token"), and the numbers it gives with no unit after them.
 */
function measures(text: string): { pairs: Set<string>; bare: Set<string> } {
  const pairs = new Set<string>();
  const bare = new Set<string>();
  for (const match of numberText(text).matchAll(new RegExp(`${NUMBER}\\s?(%|°?[\\p{L}]+(?:\\s?cent)?)?`, "gu"))) {
    const number = signed(match[1], match[2]!);
    const unit = match[3] && unitOf(match[3]);
    if (unit) pairs.add(`${number} ${unit}`);
    else bare.add(number);
  }
  return { pairs, bare };
}

/** Same word, allowing for the stemmer's single suffix: "hallucinat" (hallucinate) matches "hallucination". */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 6 && long.startsWith(short);
}

/**
 * Splits an answer into sentences: at line breaks, and after ".", "!" or "?" followed by a
 * capital letter or an opening quote or bracket, so "No. 62" and "2.0" stay whole. The "."
 * of a numbered list item ("1. Open the perspective") does not end a sentence.
 */
export function splitSentences(answer: string): string[] {
  const sentences: string[] = [];
  // "。", "！", "？" and the Devanagari danda "।" end a sentence with or without a space after them.
  const boundary = /(?<!(?:^|\n)\s*\p{N}+)[.!?]+["”’)\]]*\s+(?=[\p{Lu}"“‘(\[])|[。！？।]+[」』）"”’)\]]*\s*|\n\s*/gu;
  let start = 0;
  for (const match of answer.matchAll(boundary)) {
    const end = match.index + match[0].length;
    sentences.push(answer.slice(start, end));
    start = end;
  }
  if (start < answer.length) sentences.push(answer.slice(start));
  return sentences;
}

/**
 * Marks each sentence of an answer as backed or not by the verified quotes: backed when at
 * least half of its content words appear in them. Unverified quotes back nothing, and neither do
 * quotes that leave out more than MAX_BACKING_ELIDED_WORDS words in one place.
 *
 * The titles of the cited documents name what the quotes are about, so their words are left
 * out of the count: "LumenDB version 3.2 contains the fix" is backed by "This release includes
 * the fix" from "LumenDB 3.2 release notes". They do not back a claim on their own, so "Ada
 * Lovelace received the Charles Babbage Medal" is not backed by a quote from "Ada Lovelace"
 * that only names Babbage. A sentence made only of title words claims nothing a quote could
 * back, so it is not judged.
 *
 * Shared words alone miss the changes that matter most, so a backed sentence must also:
 * - have each of its numbers backed (numberCheck): "The page size is 8 KiB" shares every word
 *   with "The default page size is 4 KiB", but not the number;
 * - say "not" only if a verified quote that makes the same claim does: "Cobble does not support
 *   transactions" is not backed by "Cobble supports transactions", nor, since harness 0.36.0, by
 *   "Version 2.x did not support encryption" next to another quote that names Cobble. The negating
 *   quote must share at least half of the sentence's claim words on its own (MIN_BACKED_SHARE), and
 *   name its numbers (in the quote or its title): "LumenDB 3.0 does not support encryption" is not
 *   backed by "Version 2.x did not support encryption at rest". The reverse is not checked, because
 *   a quote's "not" is often in another clause than the one the sentence restates (f02, f09);
 * - since harness 0.36.0, name only the months the quotes, titles or question name in their dates:
 *   "released in May 2024" is not backed by "released in March 2024", although no number differs;
 * - give a number only the unit the quotes give it: "8 GB" is not backed by "8 MB". A number
 *   the quotes give without a unit ("-c 4096") may take one ("4096 tokens"), and a number the
 *   quotes do not have at all is left to the number check (a sum or a difference);
 * - since harness 0.67.0, give a number with its sign and power of ten: "40 °C" is not backed by
 *   "−40 °C" unless the sentence says the value fell, nor "10^3" by "10^-3" (numbers). Engineering
 *   units count as units ("276 GPa" is not backed by "276 MPa"), engineering opposites as directions
 *   ("maximum" and "minimum"), and a change "from" one number "to" another must go the quotes' way.
 */
export function sentenceSupport(
  answer: string,
  evidence: CheckedEvidence[],
  titleFor: (docId: string) => string | undefined = () => undefined,
  /**
   * The question, so an answer too short to judge can be backed by a quote that contains it
   * (SHORT_ANSWER_QUESTION_SHARE), and a sentence can restate the question's numbers.
   */
  question?: string,
): SentenceSupport {
  // Only verified quotes back sentences, and of those that leave words out, only those that leave out few.
  const verified = evidence.filter((e) => e.verified && (e.elidedWords ?? 0) <= MAX_BACKING_ELIDED_WORDS);
  const quoteWords = contentWords(verified.map((e) => e.quote).join(" "));
  const subjectWords = contentWords(verified.map((e) => titleFor(e.docId) ?? "").join(" "));
  const quoted = [...new Set(verified.flatMap((e) => [...numbers(e.quote), ...numbers(titleFor(e.docId) ?? "")]))];
  const quoteText = verified.map((e) => e.quote).join("\n");
  const numberBacked = numberCheck(quoted, question ? numbers(question) : [], saysFall(quoteText));
  const negating = verified
    .filter((e) => hasNegation(e.quote))
    .map((e) => ({ words: contentWords(e.quote), numbers: new Set([...numbers(e.quote), ...numbers(titleFor(e.docId) ?? "")]) }));
  const context = [...verified.flatMap((e) => [e.quote, titleFor(e.docId) ?? ""]), question ?? ""].join("\n");
  const months = new Set(datedMonths(context));
  const quotedMeasures = measures(context);
  // Directions and significance come from the quotes and titles only: a question asking "was it higher?" backs neither.
  const backing = verified.flatMap((e) => [e.quote, titleFor(e.docId) ?? ""]).join("\n");
  const quotedDirections = directions(backing);
  const quotedSignificance = verified.map((e) => significance(e.quote));
  const quotedChanges = changes(quoteText);
  let judged = 0;
  let backed = 0;
  const sentences = splitSentences(answer).map((text): AnswerSentence => {
    const words = contentWords(text);
    if (words.length < MIN_JUDGED_WORDS) return { text };
    const claim = words.filter((w) => !subjectWords.some((s) => sameWord(w, s)));
    if (!claim.length) return { text };
    const falls = saysFall(text);
    const shared = claim.filter((w) => quoteWords.some((q) => sameWord(w, q))).length;
    // The "not" must come from a quote making the same claim: one sharing half the claim words and
    // naming the same numbers, so "3.0 does not support it" is not backed by "2.x did not support it".
    const negationBacked =
      !hasNegation(text) ||
      negating.some(
        (quote) =>
          claim.filter((w) => quote.words.some((q) => sameWord(w, q))).length >= claim.length * MIN_BACKED_SHARE &&
          numbers(text).every((n) => quote.numbers.has(n)),
      );
    const isBacked =
      shared >= claim.length * MIN_BACKED_SHARE &&
      numbers(text).every((n) => numberBacked(n, falls)) &&
      negationBacked &&
      datedMonths(text).every((month) => months.has(month)) &&
      unitsBacked(text, quotedMeasures) &&
      directionsBacked(text, quotedDirections) &&
      significanceBacked(text, quotedSignificance) &&
      countsBacked(text, verified.map((e) => e.quote)) &&
      changesBacked(text, quotedChanges);
    judged++;
    if (isBacked) backed++;
    return { text, backed: isBacked };
  });
  if (!judged && question && answerInQuote(answer, question, verified, titleFor)) {
    return { sentences: [{ text: answer, backed: true }], judged: 1, backed: 1, answerInQuote: true };
  }
  return { sentences, judged, backed };
}

/** Whether each number the sentence gives a unit has that unit in the quotes, or no unit there, or is not quoted at all. */
function unitsBacked(text: string, quoted: { pairs: Set<string>; bare: Set<string> }): boolean {
  return [...measures(text).pairs].every((pair) => {
    const number = pair.slice(0, pair.indexOf(" "));
    const quotedWithUnit = [...quoted.pairs].some((p) => p.startsWith(`${number} `));
    return quoted.pairs.has(pair) || quoted.bare.has(number) || !quotedWithUnit;
  });
}

/**
 * Whether a sentence that says something was significant may: unless the quotes speak of significance
 * only to deny it. "There was a significant difference" is not backed by "There was no significant
 * difference", which the "not" rule does not catch, since that rule checks a "not" the sentence adds,
 * not one it drops. A sentence the quotes say nothing of significance for is left to the other checks.
 */
function significanceBacked(text: string, quoted: Array<{ asserted: boolean; negated: boolean }>): boolean {
  if (!significance(text).asserted) return true;
  return quoted.some((q) => q.asserted) || !quoted.some((q) => q.negated);
}

/** Whether a short answer is word for word in a verified quote that, with its title, covers most of the question. */
function answerInQuote(
  answer: string,
  question: string,
  verified: CheckedEvidence[],
  titleFor: (docId: string) => string | undefined,
): boolean {
  const asked = contentWords(question);
  if (!asked.length) return false;
  // A bare count ("25") answers a question about how many were recruited only from a quote that gives
  // it as more than a target (countsBacked).
  const count = saysActualCount(question);
  return verified.some((e) => {
    if (!quoteHas(e.quote, answer)) return false;
    if (count && numbers(answer).some((n) => plannedOnly(n, e.quote))) return false;
    const covered = contentWords(`${e.quote} ${titleFor(e.docId) ?? ""}`);
    return asked.filter((w) => covered.some((c) => sameWord(w, c))).length > asked.length * SHORT_ANSWER_QUESTION_SHARE;
  });
}

/**
 * Whether a cross-check counts against the answer: it read an answer in the passages, or found none, and
 * that is not the answer given. A reply that could not be read, or a call that failed, is no check at all,
 * and does not: a user's right answer about paracetamol, with five right quotes, lost its label so in the
 * browser build of Qwen3.5-4B. The other checks decide its label, which then says this one could not be
 * completed (app/research/trace.ts). Here, not in crosscheck.ts, which reads this module.
 */
export function crossCheckRejects(check: CrossCheck | undefined): boolean {
  return check?.agrees === false && check.extracted !== undefined;
}

/** Whether a cross-check was asked but gave nothing to compare: its reply could not be read, or the call failed. */
export function crossCheckIncomplete(check: CrossCheck | undefined): boolean {
  return check !== undefined && check.extracted === undefined;
}

/**
 * Whether the app labels an answer "Quotes found": a quote checked out, every quote is in its
 * source, and at least one sentence was judged and every judged sentence is backed. This is the
 * label a reader is most likely to take as "the answer is right", so the share of such answers
 * that are wrong is tracked as the false reassurance rate (docs/design.md §1.6).
 *
 * An answer too short to judge, such as "LumenDB 3.2" or "40", does not get the label from the
 * word checks: nothing compared it with the quotes. In the harness 0.15.0 reports (Qwen3.5-2B and
 * 4B), such answers were 13 of the 16 wrong answers labelled "Quotes found", and 13 of the 38 so
 * labelled were wrong. Since harness 0.34.0 the model's own check is asked about them too
 * (reviewAsked), for models whose check is measured for it (review.ts reviewsShortAnswers; since
 * 0.35.0 only Qwen3.5-4B), and one it confirms with "yes" is labelled.
 *
 * Since harness 0.28.0 the model is also asked whether the quotes back the answer (review.ts), and
 * an answer it does not confirm with "yes" is not labelled. Since 0.34.0 that includes a check
 * that gave no readable verdict ("unclear"): a failed check does not read like a passed one.
 * Answers saved before sentence support have no `support`, and answers saved before the check
 * have no `review`; both keep the rule they had.
 *
 * Since harness 0.40.0, for Qwen3.5-4B, an answer the check confirms is also cross-checked
 * (crosscheck.ts), and one whose cross-check reads a different answer in the passages is not labelled.
 * Answers saved before have no `crossCheck`, and keep their label. Since 0.67.0, a cross-check whose reply
 * could not be read, or whose call failed, does not count against the answer (crossCheckRejects).
 *
 * Since harness 0.48.0, for Qwen3.5-2B, an answer the checks confirm is also asked whether it gives
 * every part of what the question asks (completeness.ts), and one that leaves a part out is not
 * labelled. Answers saved before have no `completeness`, and keep their label.
 */
export function labelledQuotesFound(
  status: AnswerStatus | "no-answer",
  evidence: Array<{ verified: boolean }>,
  support?: { judged: number; backed: number; review?: ReviewVerdict; crossCheck?: CrossCheck; completeness?: Completeness },
): boolean {
  if (support?.review) {
    return support.review === "yes" && !crossCheckRejects(support.crossCheck) && support.completeness?.complete !== false && reviewAsked(status, evidence, support);
  }
  return wordChecksPass(status, evidence, support);
}

/** Whether the quote and sentence checks alone would label the answer "Quotes found". */
export function wordChecksPass(
  status: AnswerStatus | "no-answer",
  evidence: Array<{ verified: boolean }>,
  support?: { judged: number; backed: number },
): boolean {
  return status === "verified" && evidence.every((e) => e.verified) && (!support || (support.judged > 0 && support.backed === support.judged));
}

/**
 * Whether the model's own check may be asked about an answer (review.ts): every quote is in its
 * source, and either the word checks pass, or the answer is too short for them to judge (no sentence
 * long enough), so that the check is all that can tell a right short answer from a wrong one. Short
 * answers are asked about only for some models (review.ts reviewsShortAnswers, research.ts).
 */
export function reviewAsked(
  status: AnswerStatus | "no-answer",
  evidence: Array<{ verified: boolean }>,
  support: { judged: number; backed: number },
): boolean {
  return status === "verified" && evidence.every((e) => e.verified) && (support.judged === 0 || support.backed === support.judged);
}
