// Turns agent calls into plain-language progress lines for the live trace.

import type { CallRecord } from "../../agent/agent.ts";
import type { AnswerStatus } from "../../agent/evidence.ts";

/** ": 5 results", ": 1 document", ": nothing found", or nothing while the search runs. */
const found = (count: number | undefined, noun: string) =>
  count === undefined ? "" : count === 0 ? ": nothing found" : `: ${count} ${noun}${count === 1 ? "" : "s"}`;

const shorten = (text: string) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);

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
      return `Searching Wikipedia for “${String(args.query ?? "")}”${found(call.resultCount, "result")}`;
    case "search_openalex":
      return `Searching OpenAlex for “${String(args.query ?? "")}”${found(call.resultCount, "result")}`;
    case "read": {
      const id = String(args.docId ?? "");
      if (id.startsWith("wikipedia:")) return `Reading Wikipedia: ${id.slice(10).replace(/#\d+$/, "").replace(/_/g, " ")}`;
      if (id.startsWith("openalex:")) return `Reading OpenAlex work ${id.slice(9).replace(/#\d+$/, "")}`;
      return `Reading ${titleFor(id) ?? id}`;
    }
    case "final_answer":
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
 * not that they support every part of the answer, so the wording says only that.
 */
export function describeStatus(
  status: AnswerStatus,
  evidence: Array<{ verified: boolean }>,
): { label: string; detail: string; tone: AnswerStatus } {
  const found = evidence.filter((e) => e.verified).length;
  switch (status) {
    case "verified":
      return found === evidence.length
        ? {
            label: "Quotes found",
            detail: "Every quote below is word for word in the source it cites. Check that the quotes support the whole answer.",
            tone: "verified",
          }
        : {
            label: `Some quotes not found (${found} of ${evidence.length} found)`,
            detail: "The quotes marked ✗ are not in the sources they cite. Check the answer against the sources.",
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
