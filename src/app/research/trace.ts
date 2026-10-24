// Turns agent calls into plain-language progress lines for the live trace.

import type { CallRecord } from "../../agent/agent.ts";

export function describeCall(call: CallRecord, titleFor: (docId: string) => string | undefined): string {
  if (!call.valid) return "The model's reply was not a valid action; asking again.";
  const args = call.args ?? {};
  switch (call.tool) {
    case "search":
      return `Searching for “${String(args.query ?? "")}”`;
    case "read": {
      const id = String(args.docId ?? "");
      return `Reading ${titleFor(id) ?? id}`;
    }
    case "final_answer":
      return args.found === false ? "Concluding that the documents don't answer this" : "Writing the answer";
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

export const STATUS_TEXT = {
  verified: { label: "Verified", detail: "Every quote below was found word for word in your documents." },
  unverified: {
    label: "Unverified",
    detail: "Some quotes could not be found in your documents. The answer may be wrong; check the sources yourself.",
  },
  "not-found": { label: "Not found in your sources", detail: "The model did not find the answer in your documents." },
} as const;
