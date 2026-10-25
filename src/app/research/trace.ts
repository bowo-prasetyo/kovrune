// Turns agent calls into plain-language progress lines for the live trace.

import type { CallRecord } from "../../agent/agent.ts";
import type { AnswerStatus } from "../../agent/evidence.ts";

export function describeCall(call: CallRecord, titleFor: (docId: string) => string | undefined): string {
  if (!call.valid) return "The model's reply was not a valid action; asking again.";
  const args = call.args ?? {};
  switch (call.tool) {
    case "search":
      return `Searching your documents for “${String(args.query ?? "")}”`;
    case "search_wikipedia":
      return `Searching Wikipedia for “${String(args.query ?? "")}”`;
    case "search_openalex":
      return `Searching OpenAlex for “${String(args.query ?? "")}”`;
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
export function describeStatus(status: AnswerStatus, evidenceCount: number): { label: string; detail: string } {
  switch (status) {
    case "verified":
      return {
        label: "Quotes found",
        detail: "Every quote below is word for word in your documents. Check that they support the whole answer.",
      };
    case "unverified":
      return evidenceCount
        ? {
            label: "Quotes not found",
            detail: "Some quotes below are not in your documents. The answer may be wrong; check it against your documents.",
          }
        : {
            label: "No quotes",
            detail: "The model gave no quotes from your documents, so nothing backs this answer. Check it against your documents.",
          };
    case "not-found":
      return { label: "Not found in your sources", detail: "The model did not find the answer in the sources it searched." };
  }
}
