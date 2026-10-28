// The model's own check of an answer (audit item 4). The quote and sentence checks compare words,
// so they pass an answer that is incomplete, or takes a number from the wrong clause of a real
// quote, or answers a nearby question: the recorded false reassurance (eval/field/README.md). Before
// an answer is labelled "Quotes found", the model reads the question, the answer and the quoted
// passages, and says whether the passages state what the answer says.

import { stripThinking, type LanguageModel } from "../models/types.ts";
import type { CheckedEvidence } from "./evidence.ts";

/**
 * "yes": the passages state everything the answer says; "partly": not all of it; "no": they do not
 * answer the question; "unclear": the check was asked but gave no readable verdict, or failed.
 */
export type ReviewVerdict = "yes" | "partly" | "no" | "unclear";

/** The verdicts the model may reply with; "unclear" is the app's, for a reply it cannot read. */
const VERDICTS = ["yes", "partly", "no"] as const;

export const REVIEW_SYSTEM =
  "You check whether quoted sources back an answer to a question. Judge only from the passages you are given, not from what you know.";

/** The review prompt: the question, the answer, and each verified quote in the text around it. */
export function reviewPrompt(question: string, answer: string, evidence: CheckedEvidence[], titleFor: (docId: string) => string | undefined): string {
  const passages = evidence
    .filter((e) => e.verified)
    .map((e, i) => {
      const where = titleFor(e.docId) ?? e.docId;
      const text = e.context ? `${e.context.more.before ? "…" : ""}${e.context.before}[${e.context.passage}]${e.context.after}${e.context.more.after ? "…" : ""}` : `[${e.quote}]`;
      return `${i + 1}. From "${where}": ${text.replace(/\s+/g, " ").trim()}`;
    });
  return [
    `Question: ${question}`,
    `Answer: ${answer}`,
    "",
    "Quoted passages, with the quote in [brackets] and the text around it:",
    ...passages,
    "",
    'Do these passages state what the answer says, as an answer to this question? Reply "yes" if they state every claim of the answer. Reply "partly" if a claim is missing from them, or a number, name or condition in the answer differs from theirs, or the answer leaves out part of what the question asks. Reply "no" if they do not answer the question.',
    'Reply with exactly one JSON object: {"verdict":"yes"}, {"verdict":"partly"} or {"verdict":"no"}.',
  ].join("\n");
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: { verdict: { type: "string", enum: VERDICTS } },
  required: ["verdict"],
  additionalProperties: false,
};

/** Reads a verdict from a reply: the JSON asked for, or failing that a lone verdict word. */
export function parseVerdict(text: string): Exclude<ReviewVerdict, "unclear"> | undefined {
  const cleaned = stripThinking(text);
  const json = /"verdict"\s*:\s*"(yes|partly|no)"/i.exec(cleaned);
  if (json) return json[1]!.toLowerCase() as "yes" | "partly" | "no";
  const word = /^\W*(yes|partly|no)\W*$/i.exec(cleaned);
  return word ? (word[1]!.toLowerCase() as "yes" | "partly" | "no") : undefined;
}

/**
 * Asks the model whether the verified quotes back the answer. "unclear" when the reply cannot be
 * read or the call fails: a check that did not say yes does not give the label (support.ts), so a
 * failed check never reads like a passed one.
 */
export async function reviewAnswer(options: {
  model: LanguageModel;
  question: string;
  answer: string;
  evidence: CheckedEvidence[];
  titleFor: (docId: string) => string | undefined;
  /** Constrain the reply to a verdict when the runtime can (default), as the agent's own calls are. */
  constrained?: boolean;
  signal?: AbortSignal;
}): Promise<ReviewVerdict> {
  const { model, signal } = options;
  let text = "";
  try {
    for await (const chunk of model.generate({
      messages: [
        { role: "system", content: REVIEW_SYSTEM },
        { role: "user", content: reviewPrompt(options.question, options.answer, options.evidence, options.titleFor) },
      ],
      maxTokens: 16,
      temperature: 0,
      responseSchema: (options.constrained ?? true) && model.supportsConstrainedDecoding() ? RESPONSE_SCHEMA : undefined,
      signal,
    })) {
      text += chunk.text;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    return "unclear";
  }
  return parseVerdict(text) ?? "unclear";
}
