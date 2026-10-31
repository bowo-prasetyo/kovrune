// A check that an answer covers every part of what the question asks (audit N2). On the questions
// that need more than one passage (eval/field/multi.ts), most wrong answers answer one part and
// leave out the other, and the word checks, the review and the cross-check all pass them: each
// judges what the answer says, not what it leaves out. So the model is shown the question and the
// answer, not the passages, and asked to list the parts the question asks for, copying for each the
// words of the answer that give it. Code then checks that every part has words the answer really
// contains, compared as the cross-check compares (crosscheck.ts answersAgree).

import { stripThinking, type LanguageModel } from "../models/types.ts";
import { answersAgree } from "./crosscheck.ts";

/**
 * Whether the completeness check is asked about answers the other checks confirm, by the model's ID:
 * only Qwen3.5-2B (eval/field/README.md). On its recorded answers it took the label from 2 of the 7
 * wrong multi-passage answers labelled Quotes found, and from none of its right answers in any suite.
 * Qwen3.5-4B lists qualifiers of the question ("in metres", "according to the design") as parts the
 * answer leaves out, and took the label from 23 right answers to catch 1 wrong one. The IDs are
 * matched as for the review of short answers (review.ts reviewsShortAnswers).
 */
export function checksCompleteness(modelId: string): boolean {
  return /qwen3\.5[-_:]2b(?![\p{L}\p{N}])/iu.test(modelId);
}

export const COMPLETENESS_SYSTEM = "You compare an answer with the question it answers. Judge only what the answer says, not whether it is true.";

/** The prompt: the question and the answer, without the passages. */
export function completenessPrompt(question: string, answer: string): string {
  return [
    `Question: ${question}`,
    `Answer: ${answer}`,
    "",
    'List each separate thing the question asks for, in a few words. For each, copy the words of the answer that give it, exactly as they are written, or give "" if the answer does not give it.',
    'Reply with exactly one JSON object: {"parts":[{"asks":"...","answer":"..."}]}.',
  ].join("\n");
}

/** A question asks for a few things at most; the reply lists them briefly. The self-check counts this call in its time estimate. */
export const COMPLETENESS_MAX_TOKENS = 200;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    parts: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: { asks: { type: "string" }, answer: { type: "string" } },
        required: ["asks", "answer"],
        additionalProperties: false,
      },
    },
  },
  required: ["parts"],
  additionalProperties: false,
};

export interface AnswerPart {
  /** What the question asks for, in the model's words. */
  asks: string;
  /** The words of the answer the model says give it; empty when the answer does not. */
  answer: string;
}

/** Reads the parts from a reply: the JSON asked for; undefined when it cannot be read. */
export function parseParts(text: string): AnswerPart[] | undefined {
  const cleaned = stripThinking(text);
  try {
    const parts = (JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1)) as { parts?: unknown }).parts;
    if (!Array.isArray(parts) || !parts.length) return undefined;
    const read = parts.map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}));
    if (!read.every((p) => typeof p.asks === "string" && typeof p.answer === "string")) return undefined;
    return read.map((p) => ({ asks: (p.asks as string).trim(), answer: (p.answer as string).trim() }));
  } catch {
    return undefined;
  }
}

/**
 * Whether the answer gives every part: each has words, and the answer contains them, word for word
 * or by the cross-check's rules (its numbers, and half of its other words). An empty part is one
 * the model says the answer leaves out.
 */
export function coversEveryPart(parts: AnswerPart[], answer: string): boolean {
  return parts.length > 0 && parts.every((p) => p.answer !== "" && answersAgree(p.answer, answer));
}

export interface Completeness {
  /** The parts the model listed, or undefined when its reply could not be read. */
  parts?: AnswerPart[];
  /** Whether the answer covers every part (coversEveryPart); false when nothing could be read. */
  complete: boolean;
  /** What the question asks for that the answer does not give, in the model's words. */
  missing?: string[];
}

/** Asks the model which parts of the question the answer gives, and checks that it gives them all. */
export async function checkCompleteness(options: {
  model: LanguageModel;
  question: string;
  answer: string;
  constrained?: boolean;
  signal?: AbortSignal;
}): Promise<Completeness> {
  const { model, signal } = options;
  let text = "";
  try {
    for await (const chunk of model.generate({
      messages: [
        { role: "system", content: COMPLETENESS_SYSTEM },
        { role: "user", content: completenessPrompt(options.question, options.answer) },
      ],
      maxTokens: COMPLETENESS_MAX_TOKENS,
      temperature: 0,
      responseSchema: (options.constrained ?? true) && model.supportsConstrainedDecoding() ? RESPONSE_SCHEMA : undefined,
      signal,
    })) {
      text += chunk.text;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    return { complete: false };
  }
  const parts = parseParts(text);
  if (!parts) return { complete: false };
  const missing = parts.filter((p) => !coversEveryPart([p], options.answer)).map((p) => p.asks);
  return { parts, complete: missing.length === 0, ...(missing.length ? { missing } : {}) };
}
