/**
 * Conservative, deterministic semantic checks for research claims.
 *
 * These checks are intentionally narrow: they catch explicit opposing predicates only when
 * topic, quantities, and stated conditions align. They are not a general natural-language
 * entailment engine; ambiguous or differently scoped statements remain for human review.
 *
 * Six helpers merged with this file in 0.112.0 (claim reconciliation, single-source claim evidence,
 * arithmetic, report-section states, table interpretation, mixed-library summaries) were called by
 * nothing but their tests, and are parked: docs/p0-research-quality.md#parked-helpers says where they
 * are and what a change that brings one back needs.
 */

export interface SemanticConflict {
  docId: string;
  answer: string;
  passage: string;
  relation: string;
}

const STOP = new Set("a an and are as at be been being by did do does for from had has have in into is it its of on or that the their this to was were with".split(" "));
const PREDICATES: Array<{ relation: string; positive: RegExp; negative: RegExp }> = [
  { relation: "direction", positive: /\b(?:increase[sd]?|increasing|rose|rises|higher|greater|grew|growth)\b/i, negative: /\b(?:decrease[sd]?|decreasing|fell|falls|lower|lesser|declined|decline)\b/i },
  { relation: "presence", positive: /\b(?:present|detected|observed|exists?|occurred)\b/i, negative: /\b(?:absent|undetected|unobserved|does not exist|did not occur)\b/i },
  { relation: "significance", positive: /\b(?:statistically significant|significant difference)\b/i, negative: /\b(?:not statistically significant|no significant difference|non[- ]significant)\b/i },
  { relation: "polarity", positive: /\b(?:positive|positively)\b/i, negative: /\b(?:negative|negatively)\b/i },
  { relation: "effect", positive: /\b(?:effective|efficacious|beneficial|improved|improves)\b/i, negative: /\b(?:ineffective|inefficacious|not beneficial|worsened|worsens)\b/i },
];

function terms(text: string): Set<string> {
  return new Set((text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => word.length > 2 && !STOP.has(word)));
}

function overlap(a: string, b: string): number {
  const left = terms(a);
  const right = terms(b);
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.max(1, Math.min(left.size, right.size));
}

function quantities(text: string): string[] {
  return (text.normalize("NFKC").match(/[-+]?\d+(?:[.,]\d+)?\s*(?:%|°C|°F|K|mm|cm|m|km|mg|g|kg|μg|ug|ng|μM|uM|mM|nM|Pa|kPa|MPa|GPa|V|mV|W|kW|Hz|s|min|h|days?|weeks?|months?|years?)?/giu) ?? [])
    .map((value) => value.replace(/\s+/g, "").replace(",", ".").toLowerCase()).sort();
}

/** Keep scope comparison conservative; do not reconcile statements at different time points/groups. */
function scope(text: string): string {
  const patterns = [
    /\b(?:at|after|before|by)\s+\d+(?:\.\d+)?\s*(?:hours?|days?|weeks?|months?|years?)\b/gi,
    /\b(?:in|among|for)\s+(?:the\s+)?(?:control|treated|treatment|placebo|experimental|male|female)\s+(?:group|arm|cohort|patients?|participants?)\b/gi,
    /\b(?:in vitro|in vivo|ex vivo|in situ)\b/gi,
  ];
  return patterns.flatMap((pattern) => text.toLowerCase().match(pattern) ?? []).sort().join("|");
}

/**
 * Find a clear opposing predicate in a read source. Only same-topic, same-scope statements
 * with identical explicit quantities are returned. A mismatch is a warning, never proof that
 * either source is correct or that the papers studied equivalent populations.
 */
export function findSemanticConflicts(
  answer: string,
  documents: Array<{ docId: string; text: string }>,
  verifiedQuotes: string[] = [],
): SemanticConflict[] {
  const quotes = verifiedQuotes.map((quote) => quote.normalize("NFKC").toLowerCase());
  const conflicts: SemanticConflict[] = [];
  const answerSentences = answer.split(/(?<=[.!?。！？])\s+/u).map((part) => part.trim()).filter(Boolean);
  for (const claim of answerSentences) {
    for (const { relation, positive, negative } of PREDICATES) {
      const answerPolarity = negative.test(claim) ? "negative" : positive.test(claim) ? "positive" : undefined;
      if (!answerPolarity) continue;
      for (const { docId, text } of documents) {
        for (const passage of text.split(/(?<=[.!?。！？])\s+|\n+/u).map((part) => part.trim()).filter(Boolean)) {
          if (passage.length > 1200 || (quotes.some((quote) => quote.includes(passage.toLowerCase()) || passage.toLowerCase().includes(quote)))) continue;
          const passagePolarity = negative.test(passage) ? "negative" : positive.test(passage) ? "positive" : undefined;
          if (!passagePolarity || passagePolarity === answerPolarity) continue;
          if (scope(claim) !== scope(passage)) continue;
          const answerNumbers = quantities(claim);
          const passageNumbers = quantities(passage);
          if (answerNumbers.length !== passageNumbers.length || answerNumbers.some((value, i) => value !== passageNumbers[i])) continue;
          if (overlap(claim, passage) < 0.6) continue;
          conflicts.push({ docId, answer: claim, passage, relation });
        }
      }
    }
  }
  return conflicts;
}
