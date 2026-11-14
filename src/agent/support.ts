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
  /**
   * For a sentence no quote backs: a passage of a document the model read that would back it, had it been
   * quoted (inSourceSupport). The sentence is still not backed, and is labelled as before; the passage only
   * tells the reader where to check it, instead of "it may come from the model's memory".
   */
  inSource?: { docId: string; title?: string; passage: string };
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

/** The numbers in a text (plainNumber). A list item's own number ("1. Open the perspective") is not one of them. */
export function numbers(text: string): string[] {
  const body = normalizeForMatch(text).replace(/^\d+[.)]\s+/, "");
  return [...body.matchAll(/\p{Nd}+(?:[.,]\p{Nd}+)*/gu)].map(([n]) => plainNumber(n));
}

/**
 * Whether a number in an answer sentence is backed: it is in a verified quote or a cited title,
 * or it restates the question's own number ("In Quillstate 2.0, …"), or it is the sum or the
 * difference of two quoted numbers, as answers to "by how much" give ("by 30,000" from 180,000
 * and 150,000). Only numbers within a factor of ten of each other are compared quantities, so
 * "2021" does not pass as 2024 minus version 3.0.
 */
function numberCheck(quoted: string[], asked: string[]): (n: string) => boolean {
  const known = new Set([...quoted, ...asked]);
  const values = [...new Set(quoted.map(Number).filter((v) => v > 0))];
  const comparable = (a: number, b: number) => a !== b && Math.max(a, b) <= 10 * Math.min(a, b);
  const derived = new Set(values.flatMap((a) => values.filter((b) => comparable(a, b)).flatMap((b) => [a + b, Math.abs(a - b)])));
  return (n) => known.has(n) || derived.has(Number(n));
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
  [["above"], ["below"]],
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
  const body = normalizeForMatch(text).replace(/^\d+[.)]\s+/, "");
  for (const match of body.matchAll(/(\p{Nd}+(?:[.,]\p{Nd}+)*)\s?(%|[\p{L}]+(?:\s?cent)?)?/gu)) {
    const number = plainNumber(match[1]!);
    const unit = match[2] && UNITS.find(([, pattern]) => pattern.test(match[2]!))?.[0];
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
 * - and give a number only the unit the quotes give it: "8 GB" is not backed by "8 MB". A number
 *   the quotes give without a unit ("-c 4096") may take one ("4096 tokens"), and a number the
 *   quotes do not have at all is left to the number check (a sum or a difference).
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
  const numberBacked = numberCheck(quoted, question ? numbers(question) : []);
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
  let judged = 0;
  let backed = 0;
  const sentences = splitSentences(answer).map((text): AnswerSentence => {
    const words = contentWords(text);
    if (words.length < MIN_JUDGED_WORDS) return { text };
    const claim = words.filter((w) => !subjectWords.some((s) => sameWord(w, s)));
    if (!claim.length) return { text };
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
      numbers(text).every(numberBacked) &&
      negationBacked &&
      datedMonths(text).every((month) => months.has(month)) &&
      unitsBacked(text, quotedMeasures) &&
      directionsBacked(text, quotedDirections) &&
      significanceBacked(text, quotedSignificance) &&
      countsBacked(text, verified.map((e) => e.quote));
    judged++;
    if (isBacked) backed++;
    return { text, backed: isBacked };
  });
  if (!judged && question && answerInQuote(answer, question, verified, titleFor)) {
    return { sentences: [{ text: answer, backed: true }], judged: 1, backed: 1, answerInQuote: true };
  }
  return { sentences, judged, backed };
}

/** Passages of a document tried for each sentence no quote backs: those sharing the most of its claim words. */
const IN_SOURCE_CANDIDATES = 8;
/**
 * The claim words a passage may lack for a sentence to count as in it: one in every eight, so a sentence of
 * fewer than eight must be there whole. "In the source" should mean nearly word for word, more than a quote
 * must back (MIN_BACKED_SHARE). At one half, the same user's "It is considered a weak inhibitor of
 * prostaglandin (PG) synthesis, particularly in intact cells when arachidonic acid levels are low" was found in
 * a review saying the reverse, with 7 of its 13 words; at four in five, "The MPL-2.0 Secondary License is
 * defined as a license that is incompatible with the MPL-2.0 Primary License" was found in the licence's
 * "Incompatible With Secondary Licenses" notice, lacking only "Primary". Requiring every word lost the
 * sentence the review gives nearly word for word: "proceed" and "proceeding" stem apart.
 */
export const IN_SOURCE_WORDS_PER_MISS = 8;
/**
 * The fewest content words a sentence needs to be looked for in the sources: a claim, not a bare phrase. An
 * answer such as "Local model server" is in the user guide ("Set up a local model server") whether or not it
 * answers the question, so finding it there tells the reader nothing.
 */
const IN_SOURCE_MIN_WORDS = 6;
/** The longest passage tried: one of the document's sentences. */
const IN_SOURCE_MAX_CHARS = 1200;
/**
 * A passage that sets two claims against each other is not tried: words can be found across them for a
 * sentence that says what neither does. The paracetamol review's "Paracetamol is a weak inhibitor of PG
 * synthesis … in broken cell systems, but, by contrast, … inhibit PG synthesis in intact cells … when the
 * levels of … arachidonic acid are low", with the sentence before it, held every word of the answer's "a
 * weak inhibitor …, particularly in intact cells when arachidonic acid levels are low", which reverses it.
 * For the same reason passages are single sentences, not pairs.
 */
const CONTRAST = /\b(?:but|however|whereas|although|though|conversely|contrast|yet|unlike|while)\b/i;

/**
 * Marks the sentences no quote backs that a passage of a document the model read would back, by the same
 * rules, had it been quoted and it held nearly all the sentence's words (IN_SOURCE_WORDS_PER_MISS) (AnswerSentence.inSource). A user's answer on how paracetamol relieves pain
 * gave, unquoted, "The apparent selectivity of paracetamol may be due to inhibition of COX-2-dependent
 * pathways that proceed at low rates", nearly word for word the abstract of a review it read; the label
 * said such sentences "may come from the model's memory". The passages tried are each document's sentences,
 * but those setting two claims against each other (CONTRAST), those sharing most of the sentence's words first. The label and
 * counts do not change: a sentence is backed by what was quoted, not by what was read.
 */
export function inSourceSupport(
  support: SentenceSupport,
  documents: Array<{ docId: string; text: string }>,
  titleFor: (docId: string) => string | undefined = () => undefined,
  question?: string,
): SentenceSupport {
  if (!support.sentences.some((s) => s.backed === false) || !documents.length) return support;
  const passages = documents.map(({ docId, text }) => {
    const sentences = splitSentences(text.replace(/\s*\n\s*/g, "\n")).map((t) => t.trim()).filter(Boolean);
    return { docId, candidates: sentences.filter((t) => t.length <= IN_SOURCE_MAX_CHARS && !CONTRAST.test(t)).map((t) => ({ text: t, words: contentWords(t) })) };
  });
  return {
    ...support,
    sentences: support.sentences.map((sentence) => {
      if (sentence.backed !== false) return sentence;
      const words = contentWords(sentence.text);
      if (words.length < IN_SOURCE_MIN_WORDS) return sentence;
      for (const { docId, candidates } of passages) {
        const subject = contentWords(titleFor(docId) ?? "");
        const claim = words.filter((w) => !subject.some((t) => sameWord(w, t)));
        const ranked = candidates
          .map((c) => ({ ...c, shared: claim.filter((w) => c.words.some((q) => sameWord(w, q))).length }))
          .filter((c) => claim.length - c.shared <= Math.floor(claim.length / IN_SOURCE_WORDS_PER_MISS))
          .sort((a, b) => b.shared - a.shared || a.text.length - b.text.length)
          .slice(0, IN_SOURCE_CANDIDATES);
        for (const candidate of ranked) {
          const as = sentenceSupport(sentence.text, [{ docId, quote: candidate.text, verified: true }], titleFor, question);
          const title = titleFor(docId);
          if (as.judged > 0 && as.backed === as.judged) return { ...sentence, inSource: { docId, ...(title ? { title } : {}), passage: candidate.text } };
        }
      }
      return sentence;
    }),
  };
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
