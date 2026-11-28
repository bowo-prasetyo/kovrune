/**
 * Conservative, deterministic semantic checks for research claims.
 *
 * These checks are intentionally narrow: they catch explicit opposing predicates only when
 * topic, quantities, and stated conditions align. They are not a general natural-language
 * entailment engine; ambiguous or differently scoped statements remain for human review.
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
      const answerPolarity = positive.test(claim) ? "positive" : negative.test(claim) ? "negative" : undefined;
      if (!answerPolarity) continue;
      for (const { docId, text } of documents) {
        for (const passage of text.split(/(?<=[.!?。！？])\s+|\n+/u).map((part) => part.trim()).filter(Boolean)) {
          if (passage.length > 1200 || (quotes.some((quote) => quote.includes(passage.toLowerCase()) || passage.toLowerCase().includes(quote)))) continue;
          const passagePolarity = positive.test(passage) ? "positive" : negative.test(passage) ? "negative" : undefined;
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

export interface ResearchClaim {
  subject: string;
  predicate: string;
  value: string;
  condition?: string;
  sourceId: string;
}

/** Reconcile claims only when their subject, predicate and explicit conditions agree. */
export function reconcileClaims(claims: ResearchClaim[]): Array<{ key: string; claims: ResearchClaim[]; sourceIds: string[] }> {
  const groups = new Map<string, ResearchClaim[]>();
  for (const claim of claims) {
    const key = [claim.subject, claim.predicate, claim.condition ?? ""].map((part) => part.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()).join("|");
    groups.set(key, [...(groups.get(key) ?? []), claim]);
  }
  return [...groups.entries()].flatMap(([key, group]) => {
    const values = new Set(group.map((claim) => claim.value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()));
    return values.size > 1 ? [{ key, claims: group, sourceIds: [...new Set(group.map((claim) => claim.sourceId))] }] : [];
  });
}

export interface ClaimEvidenceAssessment {
  supported: boolean;
  share: number;
  missingNumbers: string[];
  reason: "supported" | "insufficient-overlap" | "quantity-mismatch" | "polarity-mismatch";
}

/**
 * A single-source claim check. This is provenance triage, not entailment: callers must retain
 * the source quote and use semantic review for claims that pass lexical matching.
 */
export function assessClaimEvidence(claim: string, quote: string, minimumShare = 0.6): ClaimEvidenceAssessment {
  const claimTerms = [...terms(claim)];
  const quoteTerms = terms(quote);
  const share = claimTerms.length ? claimTerms.filter((term) => quoteTerms.has(term)).length / claimTerms.length : 0;
  const claimNumbers = quantities(claim);
  const quoteNumbers = quantities(quote);
  const missingNumbers = claimNumbers.filter((number) => !quoteNumbers.includes(number));
  const polarityMismatch = /\b(?:not|never|no|without|absent|failed)\b/i.test(claim) !== /\b(?:not|never|no|without|absent|failed)\b/i.test(quote);
  const reason = missingNumbers.length ? "quantity-mismatch" : polarityMismatch ? "polarity-mismatch" : share < minimumShare ? "insufficient-overlap" : "supported";
  return { supported: reason === "supported", share, missingNumbers, reason };
}

export type ArithmeticOperation = "sum" | "difference" | "ratio" | "percent-change";
export interface ArithmeticCheck {
  operation: ArithmeticOperation;
  operands: Array<{ value: number; unit: string }>;
  claimed: { value: number; unit: string };
  tolerance?: number;
}
export interface ArithmeticResult { valid: boolean; expected: number; difference: number; reason: "matches" | "non-finite" | "unit-mismatch" | "unsupported-units" | "wrong-result" }

/** Independently recompute simple derived quantities; never infer conversions between unlike units. */
export function verifyArithmetic(check: ArithmeticCheck): ArithmeticResult {
  const [a, b] = check.operands;
  if (!a || !b || !Number.isFinite(a.value) || !Number.isFinite(b.value) || !Number.isFinite(check.claimed.value)) {
    return { valid: false, expected: Number.NaN, difference: Number.NaN, reason: "non-finite" };
  }
  const sameUnit = a.unit.trim().toLowerCase() === b.unit.trim().toLowerCase();
  if (check.operation !== "ratio" && !sameUnit) {
    return { valid: false, expected: Number.NaN, difference: Number.NaN, reason: "unit-mismatch" };
  }
  if (check.operation === "ratio" && (!sameUnit || !check.claimed.unit.trim() || check.claimed.unit.trim() === a.unit.trim())) {
    return { valid: false, expected: Number.NaN, difference: Number.NaN, reason: "unsupported-units" };
  }
  let expected: number;
  switch (check.operation) {
    case "sum": expected = a.value + b.value; break;
    case "difference": expected = a.value - b.value; break;
    case "ratio": if (b.value === 0) return { valid: false, expected: Number.NaN, difference: Number.NaN, reason: "non-finite" }; expected = a.value / b.value; break;
    case "percent-change": if (a.value === 0) return { valid: false, expected: Number.NaN, difference: Number.NaN, reason: "non-finite" }; expected = ((b.value - a.value) / Math.abs(a.value)) * 100; break;
  }
  const difference = Math.abs(expected - check.claimed.value);
  const tolerance = check.tolerance ?? Math.max(1e-9, Math.abs(expected) * 1e-6);
  return { valid: difference <= tolerance, expected, difference, reason: difference <= tolerance ? "matches" : "wrong-result" };
}

export type ReportSectionState = "not-researched" | "no-evidence" | "insufficient-evidence" | "contradictory-evidence" | "evidence-backed";
export interface ReportSectionEvidence {
  sectionId: string;
  researched: boolean;
  evidenceCount: number;
  independentSourceCount: number;
  requiredClaims: number;
  supportedClaims: number;
  contradictory: boolean;
}
/** Report sections are complete only when every required claim has evidence and no conflict remains. */
export function reportSectionState(section: ReportSectionEvidence): ReportSectionState {
  if (!section.researched) return "not-researched";
  if (section.contradictory) return "contradictory-evidence";
  if (section.evidenceCount === 0) return "no-evidence";
  if (section.independentSourceCount === 0 || section.supportedClaims < section.requiredClaims) return "insufficient-evidence";
  return "evidence-backed";
}

export interface ScientificTable {
  headers: string[];
  rows: string[][];
}
/** Interpret an already-extracted table without guessing missing cells or flattening column identity. */
export function interpretScientificTable(table: ScientificTable): Array<{ row: number; values: Record<string, { text: string; numeric?: number; unit?: string }> }> {
  return table.rows.map((cells, index) => {
    const values: Record<string, { text: string; numeric?: number; unit?: string }> = {};
    table.headers.forEach((header, column) => {
      const text = (cells[column] ?? "").trim();
      if (!text) return;
      const match = text.match(/^([-+]?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?)\s*(.*)$/i);
      values[header] = match
        ? { text, numeric: Number(match[1]!.replace(",", ".")), ...(match[2] ? { unit: match[2] } : {}) }
        : { text };
    });
    return { row: index, values };
  });
}

export interface SuiteRetrievalMetrics { suite: string; tasks: number; documentRecall: number; passageRecall: number; complete: number }
/** Report both macro-average suite performance and task-weighted pooled performance. */
export function summarizeMixedLibrary(suites: SuiteRetrievalMetrics[]): {
  suites: SuiteRetrievalMetrics[];
  macro: Omit<SuiteRetrievalMetrics, "suite">;
  pooled: Omit<SuiteRetrievalMetrics, "suite">;
} {
  const total = suites.reduce((sum, suite) => sum + suite.tasks, 0);
  const average = (field: "documentRecall" | "passageRecall" | "complete") =>
    suites.length ? suites.reduce((sum, suite) => sum + suite[field], 0) / suites.length : 0;
  const weighted = (field: "documentRecall" | "passageRecall" | "complete") =>
    total ? suites.reduce((sum, suite) => sum + suite[field] * suite.tasks, 0) / total : 0;
  return {
    suites,
    macro: { tasks: total, documentRecall: average("documentRecall"), passageRecall: average("passageRecall"), complete: average("complete") },
    pooled: { tasks: total, documentRecall: weighted("documentRecall"), passageRecall: weighted("passageRecall"), complete: weighted("complete") },
  };
}
