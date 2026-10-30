// A cross-check of an answer that does not show the model the answer (audit F2). The review (review.ts)
// shows the question, the answer and the passages, and asks whether they agree; small models say yes to
// nearly every answer with real quotes, however that is asked (eval/field/README.md). Here the model is
// shown only the question and the passages and asked for the answer it reads in them, and code compares
// that with the answer given, with the sentence check's rules for words and numbers (support.ts).

import { stripThinking, type LanguageModel } from "../models/types.ts";
import { quoteHas, type CheckedEvidence } from "./evidence.ts";
import { mainScript } from "../documents/scripts.ts";
import { quotedPassages, reviewsShortAnswers } from "./review.ts";
import { contentWords, MIN_BACKED_SHARE, numbers, sameWord } from "./support.ts";

/**
 * Whether the cross-check is asked about answers the review confirms, by the model's ID: only Qwen3.5-4B
 * (eval/field/README.md). On the 0.38.0 answers it caught 2 of the 4 wrong answers 4B's review lets
 * through, and took the label from 1 of its 109 right ones; for Qwen3.5-2B it caught none and took the
 * label from 1. The IDs are matched as for the review of short answers (review.ts reviewsShortAnswers).
 */
export function crossChecksAnswers(modelId: string): boolean {
  return reviewsShortAnswers(modelId);
}

export const CROSSCHECK_SYSTEM = "You answer questions from quoted passages only, not from what you know.";

/** The extraction prompt: the question and the quoted passages, without the answer being checked. */
export function extractionPrompt(question: string, evidence: CheckedEvidence[], titleFor: (docId: string) => string | undefined): string {
  return [
    `Question: ${question}`,
    "",
    "Quoted passages, with the quote in [brackets] and the text around it:",
    ...quotedPassages(evidence, titleFor),
    "",
    "Answer the question from these passages only, in as few words as you can: the value, name or phrase that answers it, with every part the question asks for, in the language of the question. If the passages do not answer it, give an empty answer.",
    'Reply with exactly one JSON object: {"answer":"..."}.',
  ].join("\n");
}

/** The extracted answer is a few words; the self-check counts this call in its time estimate if it is adopted. */
export const CROSSCHECK_MAX_TOKENS = 48;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
};

/** Reads the extracted answer from a reply: the JSON asked for; undefined when it cannot be read. */
export function parseExtracted(text: string): string | undefined {
  const cleaned = stripThinking(text);
  try {
    const value = (JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1)) as { answer?: unknown }).answer;
    return typeof value === "string" ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether the answer given says what the model read in the passages:
 * - it contains the extracted answer word for word ("明" in "…的明长城。"); or
 * - every number of the extracted answer is in it, and at least half of the extracted answer's other
 *   content words (MIN_BACKED_SHARE). Numbers are compared whole, so their pieces ("96" and "000" of
 *   "96,000") are not counted as words too: otherwise a half answer that repeats the number would pass.
 * The answer given may say more, such as the sentence around a value. When the two are in different
 * writing systems (the model answered in the passages' language, not the question's), words cannot be
 * compared, so only numbers are: an extracted answer with none does not count against the answer. An
 * answer given that is only a number is compared by its numbers alone. An
 * extracted answer that is empty, or has neither a number nor a content word, agrees with nothing: the
 * model found no answer there.
 */
export function answersAgree(extracted: string, answer: string): boolean {
  if (extracted && quoteHas(answer, extracted)) return true;
  const extractedNumbers = numbers(extracted);
  const answerNumbers = new Set(numbers(answer));
  if (extractedNumbers.some((n) => !answerNumbers.has(n))) return false;
  const [extractedScript, answerScript] = [mainScript(extracted)?.script, mainScript(answer)?.script];
  // An answer that is only a number ("21,196.18") has no words to compare: its numbers decide.
  if (!answerScript) return extractedNumbers.length > 0;
  if (extractedScript && extractedScript !== answerScript) return true;
  const withoutDigits = (text: string) => contentWords(text).filter((w) => !/\p{N}/u.test(w));
  const words = withoutDigits(extracted);
  if (!words.length) return extractedNumbers.length > 0;
  const given = withoutDigits(answer);
  return words.filter((w) => given.some((g) => sameWord(w, g))).length >= words.length * MIN_BACKED_SHARE;
}

export interface CrossCheck {
  /** The answer the model read in the passages, or undefined when its reply could not be read. */
  extracted?: string;
  /** Whether the answer given agrees with it (answersAgree); false when nothing could be read. */
  agrees: boolean;
}

/** Asks the model for the answer it reads in the passages, without showing it the answer, and compares the two. */
export async function crossCheckAnswer(options: {
  model: LanguageModel;
  question: string;
  answer: string;
  evidence: CheckedEvidence[];
  titleFor: (docId: string) => string | undefined;
  constrained?: boolean;
  signal?: AbortSignal;
}): Promise<CrossCheck> {
  const { model, signal } = options;
  let text = "";
  try {
    for await (const chunk of model.generate({
      messages: [
        { role: "system", content: CROSSCHECK_SYSTEM },
        { role: "user", content: extractionPrompt(options.question, options.evidence, options.titleFor) },
      ],
      maxTokens: CROSSCHECK_MAX_TOKENS,
      temperature: 0,
      responseSchema: (options.constrained ?? true) && model.supportsConstrainedDecoding() ? RESPONSE_SCHEMA : undefined,
      signal,
    })) {
      text += chunk.text;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    return { agrees: false };
  }
  const extracted = parseExtracted(text);
  return extracted === undefined ? { agrees: false } : { extracted, agrees: answersAgree(extracted, options.answer) };
}
