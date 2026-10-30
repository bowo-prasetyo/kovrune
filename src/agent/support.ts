// Sentence support (issue #31): the evidence check proves a quote is in its source, not
// that it backs the answer. Small models add claims from memory next to real quotes, so
// each answer sentence is compared with the verified quotes, and sentences that share
// few words with them are marked. This is a word-overlap heuristic, not a proof.

import { words } from "../documents/scripts.ts";
import { stem } from "../tools/search.ts";
import { hasNegation, LITERAL_BREAKS, normalizeForMatch, quoteHas, type AnswerStatus, type CheckedEvidence } from "./evidence.ts";
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
];

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
      unitsBacked(text, quotedMeasures);
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

/** Whether a short answer is word for word in a verified quote that, with its title, covers most of the question. */
function answerInQuote(
  answer: string,
  question: string,
  verified: CheckedEvidence[],
  titleFor: (docId: string) => string | undefined,
): boolean {
  const asked = contentWords(question);
  if (!asked.length) return false;
  return verified.some((e) => {
    if (!quoteHas(e.quote, answer)) return false;
    const covered = contentWords(`${e.quote} ${titleFor(e.docId) ?? ""}`);
    return asked.filter((w) => covered.some((c) => sameWord(w, c))).length > asked.length * SHORT_ANSWER_QUESTION_SHARE;
  });
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
 * Answers saved before have no `crossCheck`, and keep their label.
 */
export function labelledQuotesFound(
  status: AnswerStatus | "no-answer",
  evidence: Array<{ verified: boolean }>,
  support?: { judged: number; backed: number; review?: ReviewVerdict; crossCheck?: CrossCheck },
): boolean {
  if (support?.review) return support.review === "yes" && support.crossCheck?.agrees !== false && reviewAsked(status, evidence, support);
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
