// Sentence support (issue #31): the evidence check proves a quote is in its source, not
// that it backs the answer. Small models add claims from memory next to real quotes, so
// each answer sentence is compared with the verified quotes, and sentences that share
// few words with them are marked. This is a word-overlap heuristic, not a proof.

import { words } from "../documents/scripts.ts";
import { stem } from "../tools/search.ts";
import { hasNegation, normalizeForMatch, quoteHas, type AnswerStatus, type CheckedEvidence } from "./evidence.ts";
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
   * The model's own check (review.ts), asked only of answers the word checks would label "Quotes
   * found": whether the quoted passages state what the answer says. Absent when not asked, or when
   * the check gave no readable reply.
   */
  review?: ReviewVerdict;
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
function contentWords(text: string): string[] {
  return [...new Set(words(text).filter((t) => t.length > 1 && !STOP_WORDS.has(t)).map(stem))];
}

/**
 * The numbers in a text, without thousands separators ("4,096" is "4096"). A list item's own
 * number ("1. Open the perspective") is not one of them.
 */
function numbers(text: string): string[] {
  const body = normalizeForMatch(text).replace(/^\d+[.)]\s+/, "");
  return [...body.matchAll(/\p{Nd}+(?:[.,]\p{Nd}+)*/gu)].map(([n]) => n.replace(/,/g, ""));
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

/** Same word, allowing for the stemmer's single suffix: "hallucinat" (hallucinate) matches "hallucination". */
function sameWord(a: string, b: string): boolean {
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
 * least half of its content words appear in them. Unverified quotes back nothing.
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
 * - say "not" only if a verified quote does: "Cobble does not support transactions" is not
 *   backed by "Cobble supports transactions". The reverse is not checked, because a quote's
 *   "not" is often in another clause than the one the sentence restates (field tasks f02, f09).
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
  const verified = evidence.filter((e) => e.verified);
  const quoteWords = contentWords(verified.map((e) => e.quote).join(" "));
  const subjectWords = contentWords(verified.map((e) => titleFor(e.docId) ?? "").join(" "));
  const quoted = [...new Set(verified.flatMap((e) => [...numbers(e.quote), ...numbers(titleFor(e.docId) ?? "")]))];
  const numberBacked = numberCheck(quoted, question ? numbers(question) : []);
  const quoteNegates = verified.some((e) => hasNegation(e.quote));
  let judged = 0;
  let backed = 0;
  const sentences = splitSentences(answer).map((text): AnswerSentence => {
    const words = contentWords(text);
    if (words.length < MIN_JUDGED_WORDS) return { text };
    const claim = words.filter((w) => !subjectWords.some((s) => sameWord(w, s)));
    if (!claim.length) return { text };
    const shared = claim.filter((w) => quoteWords.some((q) => sameWord(w, q))).length;
    const isBacked =
      shared >= claim.length * MIN_BACKED_SHARE && numbers(text).every(numberBacked) && (quoteNegates || !hasNegation(text));
    judged++;
    if (isBacked) backed++;
    return { text, backed: isBacked };
  });
  if (!judged && question && answerInQuote(answer, question, verified, titleFor)) {
    return { sentences: [{ text: answer, backed: true }], judged: 1, backed: 1, answerInQuote: true };
  }
  return { sentences, judged, backed };
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
 * An answer too short to judge, such as "LumenDB 3.2" or "40", does not get the label: nothing
 * compared it with the quotes. In the harness 0.15.0 reports (Qwen3.5-2B and 4B), such answers
 * were 13 of the 16 wrong answers labelled "Quotes found", and 13 of the 38 so labelled were wrong.
 * Answers saved before sentence support have no `support` and keep the rule they had.
 *
 * Since harness 0.28.0 the model is also asked whether the quotes back the answer (review.ts), and
 * an answer it does not confirm with "yes" is not labelled. Answers saved before the check have no
 * `review` and keep the rule they had.
 */
export function labelledQuotesFound(
  status: AnswerStatus | "no-answer",
  evidence: Array<{ verified: boolean }>,
  support?: { judged: number; backed: number; review?: ReviewVerdict },
): boolean {
  return wordChecksPass(status, evidence, support) && (!support?.review || support.review === "yes");
}

/** Whether the quote and sentence checks alone would label the answer "Quotes found": the cases the model's review is asked about. */
export function wordChecksPass(
  status: AnswerStatus | "no-answer",
  evidence: Array<{ verified: boolean }>,
  support?: { judged: number; backed: number },
): boolean {
  return status === "verified" && evidence.every((e) => e.verified) && (!support || (support.judged > 0 && support.backed === support.judged));
}
