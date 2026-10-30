// Turns agent calls into plain-language progress lines for the live trace.

import type { CallRecord } from "../../agent/agent.ts";
import type { AnswerStatus } from "../../agent/evidence.ts";
import type { CrossCheck } from "../../agent/crosscheck.ts";
import type { ReviewVerdict } from "../../agent/review.ts";
import { labelledQuotesFound, reviewAsked } from "../../agent/support.ts";

/** ": 5 results", ": 1 document", ": nothing found", or nothing while the search runs. */
const found = (count: number | undefined, noun: string) =>
  count === undefined ? "" : count === 0 ? ": nothing found" : `: ${count} ${noun}${count === 1 ? "" : "s"}`;

const shorten = (text: string) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);

/** The trace step for the model's own check of its answer (agent/review.ts). */
export const REVIEW_STEP = "Checking that the quoted passages back the answer";

export function describeCall(call: CallRecord, titleFor: (docId: string) => string | undefined): string {
  if (!call.valid) {
    return call.cutOff
      ? "The model's reply was cut off at the length limit; asking again with more room."
      : `The model's reply was not a valid action (${shorten(call.error ?? "unknown error")}); asking again.`;
  }
  const args = call.args ?? {};
  switch (call.tool) {
    case "search":
      return `Searching your documents for “${String(args.query ?? "")}”${found(call.resultCount, "document")}`;
    case "search_wikipedia":
      return `Searching Wikipedia for “${String(args.query ?? "")}”${call.failed ? ": failed" : found(call.resultCount, "result")}`;
    case "search_openalex":
      return `Searching OpenAlex for “${String(args.query ?? "")}”${call.failed ? ": failed" : found(call.resultCount, "result")}`;
    case "read": {
      const id = String(args.docId ?? "");
      if (id.startsWith("wikipedia:")) return `Reading Wikipedia: ${id.slice(10).replace(/#\d+$/, "").replace(/_/g, " ")}`;
      if (id.startsWith("openalex:")) return `Reading OpenAlex work ${id.slice(9).replace(/#\d+$/, "")}`;
      return `Reading ${titleFor(id) ?? id}`;
    }
    case "final_answer":
      if (call.rejected) return call.rejected;
      return args.found === false ? "Concluding that the sources don't answer this" : "Writing the answer";
    default:
      return String(call.tool);
  }
}

/** Why a run ended without an answer, in plain language. */
export function describeNoAnswer(stopReason: string, error?: string): string {
  switch (stopReason) {
    case "max-calls":
      return "The model used all its steps without giving an answer. Try a more specific question.";
    case "context-overflow":
      return "The search results no longer fit in the model's context. Try a more specific question, or a model server with a longer context.";
    case "error":
      return `The model server stopped responding: ${error ?? "unknown error"}`;
    default:
      return "The model did not give an answer.";
  }
}

/**
 * The status line for an answer. A quote check proves the quotes are in the documents,
 * not that they support every part of the answer, so the wording says only that. With
 * `support`, the label also says how many of the answer's sentences a found quote backs.
 */
export function describeStatus(
  status: AnswerStatus,
  evidence: Array<{ verified: boolean }>,
  support?: { judged: number; backed: number; answerInQuote?: boolean; review?: ReviewVerdict; crossCheck?: CrossCheck },
): { label: string; detail: string; tone: AnswerStatus } {
  const found = evidence.filter((e) => e.verified).length;
  const unbacked = support ? support.judged - support.backed : 0;
  const coverage = support && `${support.backed} of ${support.judged} sentences backed by a quote`;
  switch (status) {
    case "verified":
      if (labelledQuotesFound(status, evidence, support)) {
        return {
          label: "Quotes found",
          detail: support?.answerInQuote
            ? "Every quote below is word for word in the source it cites, and the answer is in one of them, in a passage that shares most of the words of your question. Check that the quote answers what you asked."
            : support?.judged
            ? "Every quote below is word for word in the source it cites, and every sentence shares most of its words with a quote. Check that the quotes say what the answer says."
            : support?.review === "yes"
            ? "Every quote below is word for word in the source it cites. The answer is too short to compare with them word by word, but asked whether the quoted passages state it, the model said yes. Check that the quotes answer your question."
            : "Every quote below is word for word in the source it cites. Check that the quotes support the whole answer.",
          tone: "verified",
        };
      }
      // Every quote is found, and the model's check said yes, but the answer it read in the passages
      // without seeing this one is a different one (crosscheck.ts).
      if (support?.review === "yes" && support.crossCheck?.agrees === false && reviewAsked(status, evidence, support)) {
        const read = support.crossCheck.extracted;
        return {
          label: "Quotes found, answer not confirmed",
          detail: `Every quote below is word for word in the source it cites, but asked for the answer in the quoted passages without seeing this one, the model ${read ? `read "${read}"` : "found no answer in them"}. The answer may come from the wrong passage or leave something out: check it against the sources.`,
          tone: "unverified",
        };
      }
      // Every quote is found, but the model's own check does not confirm the answer (review.ts).
      if (support?.review && support.review !== "yes" && reviewAsked(status, evidence, support)) {
        return {
          label: "Quotes found, answer not confirmed",
          detail: {
            no: "Every quote below is word for word in the source it cites, but asked whether the quoted passages answer your question, the model said they do not. The answer may come from the wrong passage: check it against the sources.",
            partly:
              "Every quote below is word for word in the source it cites, but asked whether the quoted passages state everything the answer says, the model said only partly. Part of the answer, such as a number or a condition, may differ from the sources or be missing: check it against them.",
            unclear:
              "Every quote below is word for word in the source it cites, but the model's check of whether the quoted passages state what the answer says gave no clear reply. Check the answer against the sources.",
          }[support.review],
          tone: "unverified",
        };
      }
      if (found === evidence.length && support?.judged === 0) {
        return {
          label: "Quotes found, answer too short to check",
          detail:
            "Every quote below is word for word in the source it cites, but the answer is too short to compare with them. Short answers like this are often wrong even with real quotes: check that the quotes answer your question.",
          tone: "unverified",
        };
      }
      return found === evidence.length
        ? {
            label: coverage!,
            detail:
              "Every quote below is word for word in the source it cites, but the sentences marked ⚠ share few words with the quotes, or have a number, unit, month or a \"not\" that the quotes don't back, or rest on a quote that leaves out many words. They may come from the model's memory; check them against the sources.",
            tone: "unverified",
          }
        : {
            label: `Some quotes not found (${found} of ${evidence.length} found)`,
            detail:
              "The quotes marked ✗ are not in the sources they cite." +
              (unbacked > 0 ? ` ${coverage}; the others are marked ⚠.` : "") +
              " Check the answer against the sources.",
            tone: "unverified",
          };
    case "unverified":
      return evidence.length
        ? {
            label: "Quotes not found",
            detail: "The quotes below are not in the sources they cite. The answer may be wrong; check it against the sources.",
            tone: "unverified",
          }
        : {
            label: "No quotes",
            detail: "The model answered without quoting any source, so nothing backs this answer. Check it before relying on it.",
            tone: "unverified",
          };
    case "not-found":
      return { label: "Not found in your sources", detail: "The model did not find the answer in the sources it searched.", tone: "not-found" };
  }
}

/** "p. 4", or "pp. 3–5" for a quote that runs across pages. */
export function describePages({ first, last }: { first: number; last: number }): string {
  return first === last ? `p. ${first}` : `pp. ${first}–${last}`;
}
