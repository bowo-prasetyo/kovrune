// Turns agent calls into plain-language progress lines for the live trace.

import type { CallRecord } from "../../agent/agent.ts";
import type { AnswerStatus } from "../../agent/evidence.ts";
import type { Completeness } from "../../agent/completeness.ts";
import type { CrossCheck } from "../../agent/crosscheck.ts";
import type { ReviewVerdict } from "../../agent/review.ts";
import { crossCheckIncomplete, crossCheckRejects, labelledQuotesFound, reviewAsked } from "../../agent/support.ts";

/** ": 5 results", ": 1 document", ": nothing found", or nothing while the search runs. */
const found = (count: number | undefined, noun: string) =>
  count === undefined ? "" : count === 0 ? ": nothing found" : `: ${count} ${noun}${count === 1 ? "" : "s"}`;

const shorten = (text: string) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);

/** The longest reply quoted in a label; the saved answer keeps more (crosscheck.ts REPLY_CHARS). */
const LABEL_REPLY_CHARS = 120;

/**
 * What the cross-check found, for the label: the answer the model read, that it found none, or why it
 * gave none that could be read. Answers saved before the reply was kept tell an empty answer ("") from
 * an unreadable reply (no `extracted`) all the same.
 */
export function crossCheckFinding(check: CrossCheck): string {
  if (check.extracted) return `the model read "${check.extracted}"`;
  if (check.extracted === "") return "the model found no answer in them";
  if (check.failed) return "the check could not be run: the model could not be asked";
  const reply = check.reply?.trim();
  const shown = reply ? `: "${reply.length > LABEL_REPLY_CHARS ? `${reply.slice(0, LABEL_REPLY_CHARS)}…` : reply}"` : "";
  if (check.cutOff) return `the model's reply was cut off at its length limit before it gave an answer${shown}`;
  return reply ? `the model's reply could not be read as an answer${shown}` : "the model gave no reply that could be read";
}

/**
 * Where the ⚠ sentences may come from: a source the model read, for those nearly word for word in one
 * though not quoted (support.ts inSourceSupport), else perhaps the model's memory.
 */
export function unquotedNote(support: { sentences?: Array<{ backed?: boolean; inSource?: unknown }> }): string {
  const marked = (support.sentences ?? []).filter((s) => s.backed === false);
  const inSource = marked.filter((s) => s.inSource).length;
  if (!inSource) return "They may come from the model's memory; check them against the sources.";
  if (inSource === marked.length)
    return `${marked.length === 1 ? "It is" : "They are"} nearly word for word in a source the model read, marked "in the source, not quoted", but not in a quote: check ${marked.length === 1 ? "it" : "them"} there.`;
  return `Those marked "in the source, not quoted" are nearly word for word in a source the model read, but not in a quote: check them there. The others may come from the model's memory; check them against the sources.`;
}

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
    case "search_arxiv":
      return `Searching arXiv for “${String(args.query ?? "")}”${call.failed ? ": failed" : found(call.resultCount, "result")}`;
    case "search_datacite":
      return `Searching DataCite for “${String(args.query ?? "")}”${call.failed ? ": failed" : found(call.resultCount, "result")}`;
    case "search_europepmc":
      return `Searching Europe PMC for “${String(args.query ?? "")}”${call.failed ? ": failed" : found(call.resultCount, "result")}`;
    case "read": {
      const id = String(args.docId ?? "");
      // Which part: the one the read gave (call.shown, once it has run), else the one the ID names. Without it,
      // three reads of one article showed as the same line three times ("Reading Wikipedia: Paracetamol").
      const named = /#(\d+)$/.exec(id)?.[1];
      const part = call.shown ? ` (${call.shown})` : named ? ` (part ${named})` : "";
      const bare = id.replace(/#\d+$/, "");
      if (id.startsWith("wikipedia:")) return `Reading Wikipedia: ${bare.slice(10).replace(/_/g, " ")}${part}`;
      if (id.startsWith("openalex:")) return `Reading OpenAlex work ${bare.slice(9)}${part}`;
      if (id.startsWith("arxiv:")) return `Reading arXiv paper ${bare.slice(6)}${part}`;
      if (id.startsWith("datacite:")) return `Reading DataCite work ${bare.slice(9)}${part}`;
      if (id.startsWith("europepmc:")) return `Reading Europe PMC work ${bare.slice(10)}${part}`;
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
 * How much a label asks of the reader, for how it looks: "found" when every check passed, "check" when
 * the quotes are real but the answer may not follow from them, "danger" when quotes are missing or not
 * in the sources, so nothing backs the answer, and "none" when there is no answer to trust.
 */
export type LabelSeverity = "found" | "check" | "danger" | "none";

/**
 * The status line for an answer. A quote check proves the quotes are in the documents,
 * not that they support every part of the answer, so the wording says only that. With
 * `support`, the label also says how many of the answer's sentences a found quote backs.
 */
export function describeStatus(
  status: AnswerStatus,
  evidence: Array<{ verified: boolean }>,
  support?: { judged: number; backed: number; sentences?: Array<{ backed?: boolean; inSource?: unknown }>; answerInQuote?: boolean; review?: ReviewVerdict; crossCheck?: CrossCheck; completeness?: Completeness },
): { label: string; detail: string; tone: AnswerStatus; severity: LabelSeverity } {
  const found = evidence.filter((e) => e.verified).length;
  const unbacked = support ? support.judged - support.backed : 0;
  const coverage = support && `${support.backed} of ${support.judged} ${support.judged === 1 ? "sentence" : "sentences"} backed by a quote`;
  switch (status) {
    case "verified":
      if (labelledQuotesFound(status, evidence, support)) {
        // A cross-check that gave nothing to compare does not take the label (support.ts crossCheckRejects), and is said.
        const incomplete = crossCheckIncomplete(support?.crossCheck)
          ? ` A second check, asking the model for the answer in the quoted passages without showing it this one, could not be completed: ${crossCheckFinding(support!.crossCheck!)}.`
          : "";
        return {
          label: "Quotes found",
          detail: (support?.answerInQuote
            ? "Every quote below is word for word in the source it cites, and the answer is in one of them, in a passage that shares most of the words of your question. Check that the quote answers what you asked."
            : support?.judged
            ? "Every quote below is word for word in the source it cites, and every sentence shares most of its words with a quote. Check that the quotes say what the answer says."
            : support?.review === "yes"
            ? "Every quote below is word for word in the source it cites. The answer is too short to compare with them word by word, but asked whether the quoted passages state it, the model said yes. Check that the quotes answer your question."
            : "Every quote below is word for word in the source it cites. Check that the quotes support the whole answer.") + incomplete,
          tone: "verified",
          severity: "found",
        };
      }
      // Every quote is found, and the model's check said yes, but the answer it read in the passages
      // without seeing this one is a different one (crosscheck.ts).
      if (support?.review === "yes" && crossCheckRejects(support.crossCheck) && reviewAsked(status, evidence, support)) {
        return {
          label: "Quotes found, answer not confirmed",
          detail: `Every quote below is word for word in the source it cites, but asked for the answer in the quoted passages without seeing this one, ${crossCheckFinding(support.crossCheck!)}. The answer may come from the wrong passage or leave something out: check it against the sources.`,
          tone: "unverified",
          severity: "check",
        };
      }
      // Every quote is found, and the other checks confirm what the answer says, but asked which parts of
      // the question it answers, the model found one it leaves out (completeness.ts).
      if (support?.review === "yes" && !crossCheckRejects(support.crossCheck) && support.completeness?.complete === false && reviewAsked(status, evidence, support)) {
        const missing = support.completeness.missing?.[0];
        return {
          label: "Quotes found, answer not confirmed",
          detail: `Every quote below is word for word in the source it cites, but asked which parts of your question the answer gives, the model ${
            support.completeness.parts ? `found one it leaves out${missing ? `: "${missing}"` : ""}` : "gave no clear reply"
          }. Check that the answer covers everything you asked.`,
          tone: "unverified",
          severity: "check",
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
          severity: "check",
        };
      }
      if (found === evidence.length && support?.judged === 0) {
        return {
          label: "Quotes found, answer too short to check",
          detail:
            "Every quote below is word for word in the source it cites, but the answer is too short to compare with them. Short answers like this are often wrong even with real quotes: check that the quotes answer your question.",
          tone: "unverified",
          severity: "check",
        };
      }
      return found === evidence.length
        ? {
            label: coverage!,
            detail:
              "Every quote below is word for word in the source it cites, but the sentences marked ⚠ share few words with the quotes, or have a number, unit, month, a \"not\", a direction such as \"higher\", or \"significant\" that the quotes don't back, or rest on a quote that leaves out many words. " +
              unquotedNote(support!),
            tone: "unverified",
            severity: "check",
          }
        : {
            label: `Some quotes not found (${found} of ${evidence.length} found)`,
            detail:
              "The quotes marked ✗ are not in the sources they cite." +
              (unbacked > 0 ? ` ${coverage}; the others are marked ⚠.` : "") +
              " Check the answer against the sources.",
            tone: "unverified",
            severity: "danger",
          };
    case "unverified":
      return evidence.length
        ? {
            label: "Quotes not found",
            detail: "The quotes below are not in the sources they cite. The answer may be wrong; check it against the sources.",
            tone: "unverified",
            severity: "danger",
          }
        : {
            label: "No quotes",
            detail: "The model answered without quoting any source, so nothing backs this answer. Check it before relying on it.",
            tone: "unverified",
            severity: "danger",
          };
    case "not-found":
      return { label: "Not found in your sources", detail: "The model did not find the answer in the sources it searched.", tone: "not-found", severity: "none" };
  }
}

/** "p. 4", or "pp. 3–5" for a quote that runs across pages; "slide 4" or "slides 3–5" in a presentation, "sheet 2" in a spreadsheet. */
export function describePages({ first, last }: { first: number; last: number }, unit: "page" | "slide" | "sheet" = "page"): string {
  if (unit !== "page") return first === last ? `${unit} ${first}` : `${unit}s ${first}–${last}`;
  return first === last ? `p. ${first}` : `pp. ${first}–${last}`;
}
