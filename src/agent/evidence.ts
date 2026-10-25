// Evidence check (docs/m1-plan.md): an answer must quote its sources, and each
// quote is verified against the cited document. Small models invent answers, so
// the app shows whether an answer is backed by text that is really there.

export interface EvidenceItem {
  docId: string;
  quote: string;
}

export interface CheckedEvidence extends EvidenceItem {
  verified: boolean;
  /** Why a quote did not verify. */
  reason?: string;
}

export type AnswerStatus = "verified" | "unverified" | "not-found";

/** Quotes shorter than this many words are too weak to count as evidence. */
export const MIN_QUOTE_WORDS = 3;

/** Lower-cases and unifies quotes, dashes and whitespace, so formatting differences do not fail a quote. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripEdgePunctuation(text: string): string {
  return text.replace(/^[\s"'.,;:…-]+|[\s"'.,;:…-]+$/g, "");
}

/**
 * Checks each quote against its document. `resolveText` returns the full text
 * for a document or chunk ID, or undefined when the ID does not exist.
 */
export function checkEvidence(items: EvidenceItem[], resolveText: (docId: string) => string | undefined): CheckedEvidence[] {
  return items.map((item) => {
    const text = resolveText(item.docId);
    if (text === undefined) return { ...item, verified: false, reason: "the model cited a document ID it never found" };
    const quote = stripEdgePunctuation(normalizeForMatch(item.quote));
    if (quote.split(" ").filter(Boolean).length < MIN_QUOTE_WORDS) {
      return { ...item, verified: false, reason: `quote shorter than ${MIN_QUOTE_WORDS} words` };
    }
    return normalizeForMatch(text).includes(quote)
      ? { ...item, verified: true }
      : { ...item, verified: false, reason: "quote not found in the document" };
  });
}

export function answerStatus(found: boolean, checked: CheckedEvidence[]): AnswerStatus {
  if (!found) return "not-found";
  return checked.some((c) => c.verified) ? "verified" : "unverified";
}
