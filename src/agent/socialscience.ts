// What the sentence check reads in a social-science result (harness 0.105.0): which group a comparison puts
// first, how strong a claim is, and whether a change is in percent or percentage points. The social-sciences
// audit (docs/social-sciences-audit.md, S2) ran the sentence check on 24 wrong sentences, each with a real
// quote, and 17 were marked backed, among them "men were more likely than women" for "women were more likely
// than men", "caused" for "was associated with", "demonstrate … reduces" for "suggest … may reduce", and "7
// percent" for "7 percentage points". Each shares nearly every word with its quote: what changed is the order of
// the words, or one word that says how sure the paper is.
//
// Each check follows the rule of the opposites in support.ts: a sentence may say what the quotes say, or what
// they say nothing of. It is marked only when it says one thing and the quotes say another of the same kind.

import { contentWords, numbers, sameWord } from "./support.ts";

/** A comparative a comparison turns on, by the way it points: "more likely than", "higher … than", "fewer … than". */
export const UP = new Set(["more", "higher", "greater", "larger", "bigger", "better", "likelier", "stronger", "longer", "older", "richer", "wealthier"]);
export const DOWN = new Set(["less", "fewer", "lower", "smaller", "worse", "weaker", "shorter", "younger", "poorer"]);
/** What a comparison's second side starts after: "than", "compared with", "compared to", "relative to", "versus". */
const SECOND_SIDE = /\b(?:than|compared (?:with|to)|relative to|versus|vs\.?)\s+/i;
/** Words naming a side's second group are read from at most this many content words after SECOND_SIDE. */
const SIDE_WORDS = 3;

/** A comparison in a clause: the content words before its comparative, those after "than", and which way it points. */
export interface Comparison {
  first: string[];
  second: string[];
  up: boolean;
}

/**
 * The comparisons a text makes, one per clause that has a comparative before "than" (or "compared with", "relative
 * to", "versus"): "Women were more likely than men to report harassment" gives first ["women"], second ["men",
 * "report", "harassment"], up. The comparative nearest before "than" is the one compared; the words of each side
 * that the other side also has ("participants" in "Black participants … than White participants") are left out,
 * so only what tells the two groups apart is compared.
 */
export function comparisons(text: string): Comparison[] {
  const found: Comparison[] = [];
  for (const clause of text.split(/[.;:!?](?:\s|$)|\n/)) {
    const at = SECOND_SIDE.exec(clause);
    if (!at) continue;
    const before = clause.slice(0, at.index);
    const words = before.toLowerCase().match(/[\p{L}]+/gu) ?? [];
    let k = words.length - 1;
    while (k >= 0 && !UP.has(words[k]!) && !DOWN.has(words[k]!)) k--;
    if (k < 0) continue;
    // The first side: the words before the comparative ("Women were"), not those between it and "than" ("to report").
    const comparative = new RegExp(`\\b${words[k]}\\b`, "gi");
    const last = [...before.matchAll(comparative)].at(-1)!;
    const first = contentWords(before.slice(0, last.index).replace(/\p{Nd}+(?:[.,]\p{Nd}+)*%?/gu, " "));
    const second = contentWords(clause.slice(at.index + at[0].length).replace(/\p{Nd}+(?:[.,]\p{Nd}+)*%?/gu, " ")).slice(0, SIDE_WORDS);
    const own = (side: string[], other: string[]) => side.filter((w) => !other.some((o) => sameWord(w, o)));
    const [a, b] = [own(first, second), own(second, first)];
    if (a.length && b.length) found.push({ first: a, second: b, up: UP.has(words[k]!) });
  }
  return found;
}

const shares = (a: string[], b: string[]) => a.some((w) => b.some((v) => sameWord(w, v)));

/**
 * Whether a comparison is a quote's turned round: its second group is the quote's first, its first the quote's
 * second, and it points the same way. "Men were more likely than women" turns "Women were more likely than men"
 * round; "Men were less likely than women" says the same as it, and is not marked.
 */
function crossed(said: Comparison, quoted: Comparison): boolean {
  const crosses = (side: string[], to: string[], from: string[]) => side.some((w) => to.some((v) => sameWord(w, v)) && !from.some((v) => sameWord(w, v)));
  return crosses(said.second, quoted.first, quoted.second) && crosses(said.first, quoted.second, quoted.first);
}

/**
 * Whether a sentence restates a quoted comparison from its other side: its groups are the quote's the other way
 * round and it points the other way, "White participants were more likely than Black participants" for "Black
 * participants were less likely than White participants". Such a sentence says "more" where the quote says "less",
 * so the opposites of comparatives (support.ts directionsBacked) are not judged for it.
 */
export function restatesComparison(text: string, quoted: Comparison[]): boolean {
  return comparisons(text).some((s) => quoted.some((q) => s.up !== q.up && crossed(s, q)));
}

function turnedRound(said: Comparison, quoted: Comparison): boolean {
  // A word of one side that the quote has on the other side only: words both sides of the quote's first part share,
  // such as "two times" in "Democrats were two times more likely", tell no group apart.
  const crosses = (side: string[], to: string[], from: string[]) => side.some((w) => to.some((v) => sameWord(w, v)) && !from.some((v) => sameWord(w, v)));
  return said.up === quoted.up && crosses(said.second, quoted.first, quoted.second) && crosses(said.first, quoted.second, quoted.first);
}

/**
 * Wording that says one thing causes another, and wording that says two things only go together: a sentence may not
 * say "caused" from quotes that say only "associated", "correlated" or "linked". Only the explicit words: "led to",
 * "resulted in" and "as a result of" are how answers paraphrase an experiment, and a lab suite's right answer,
 * "reduced IL10 expression led to increased pathogen clearance", from a knockout, lost its label to them (0.105.0).
 */
const CAUSAL = /\b(?:caus(?:e|es|ed|ing|al|ally))\b/i;
// Not after a hyphen: "X-linked" is a gene's place, "disease-associated" a name, not a finding that two things go together.
const ASSOCIATIONAL = /(?<![-\w])(?:associat\w*|correlat\w*|linked)\b/i;
/**
 * Wording that says a finding is certain, and wording that says it is tentative: a sentence may not say "demonstrates"
 * or "proves" from quotes that say only "suggests", "may" or "might". Kept apart from cause and association since a
 * held-out lab answer saying "caused", from quotes hedged with one of these, lost its label when the two were one rule.
 */
const CERTAIN = /\b(?:demonstrat\w*|proves?|proved|proven|establish(?:es|ed)? that|confirm(?:s|ed)? that)\b/i;
const TENTATIVE = /\b(?:suggest(?:s|ed|ing)?|may|might)\b/i;

/** Numbers a text gives in percentage points ("7 percentage points", "7 pp"), and those it gives in percent ("7%", "7 percent"). */
function shares100(text: string): { points: Set<string>; percent: Set<string> } {
  const points = new Set<string>();
  const percent = new Set<string>();
  for (const m of text.matchAll(/(\p{Nd}+(?:[.,]\p{Nd}+)?)\s*(percentage[ -]points?|pp\b|%-?points?|% points?|per ?cent(?:age)?\b|%)/giu)) {
    const n = numbers(m[1]!)[0];
    if (n === undefined) continue;
    (/point|pp/i.test(m[2]!) ? points : percent).add(n);
  }
  return { points, percent };
}

/** An interviewer's label at the start of a transcript's line: "Interviewer:", "IV:", "INT:", "I:", "Q:", "Moderator [00:01:02]:". */
const INTERVIEWER = /^(?:interviewer|interviewers|int|iv|i|q|moderator|facilitator)(?: \[[\d:]+\])?:\s/i;
/** Words a sentence uses when it reports what an interviewer asked, not what a participant said. */
const ASKED = /\b(?:interviewer|interviewers|ask(?:s|ed|ing)?|question(?:s|ed)?|prompt(?:s|ed)?|moderator)\b/i;

/**
 * Whether a verified quote is an interviewer's turn in a transcript: the quote starts with the interviewer's label,
 * or the line it stands in does. `line` is the start of that line before the quote, when the context shows it.
 */
export function interviewerQuote(quote: string, line?: string): boolean {
  return INTERVIEWER.test(quote.trim()) || (line !== undefined && INTERVIEWER.test(line.trimStart()));
}

/** What a sentence is checked against: the comparisons the quotes make, how strong they are, their shares, and whose turns they are. */
export interface SocialBacking {
  comparisons: Comparison[];
  causal: boolean;
  associational: boolean;
  certain: boolean;
  tentative: boolean;
  shares: { points: Set<string>; percent: Set<string> };
  /** Every verified quote is an interviewer's turn (interviewerQuote). */
  interviewerOnly: boolean;
}

/** The social-science backing of verified quotes and their titles; `interviewerOnly` when every quote is an interviewer's. */
export function socialBacking(backing: string, interviewerOnly = false): SocialBacking {
  return { comparisons: comparisons(backing), causal: CAUSAL.test(backing), associational: ASSOCIATIONAL.test(backing), certain: CERTAIN.test(backing), tentative: TENTATIVE.test(backing), shares: shares100(backing), interviewerOnly };
}

/**
 * Whether a sentence's social-science claims are backed:
 * - no comparison of the sentence turns a quoted one round;
 * - a sentence saying one thing causes another is not backed by quotes that say only that the two are associated, and
 *   one saying a result is demonstrated or proved is not backed by quotes that say only that it suggests or may;
 * - a number the sentence gives in percent is not one the quotes give only in percentage points, and the reverse;
 * - quotes that are all an interviewer's turns back only a sentence that says what was asked: "the participant felt
 *   excluded" is not backed by "Interviewer: So would you say you felt excluded?".
 */
export function socialBacked(text: string, backing: SocialBacking): boolean {
  if (backing.interviewerOnly && !ASKED.test(text)) return false;
  const said = comparisons(text);
  if (said.some((s) => backing.comparisons.some((q) => turnedRound(s, q)))) return false;
  if (CAUSAL.test(text) && !backing.causal && backing.associational) return false;
  if (CERTAIN.test(text) && !backing.certain && backing.tentative) return false;
  const own = shares100(text);
  if ([...own.percent].some((n) => backing.shares.points.has(n) && !backing.shares.percent.has(n))) return false;
  if ([...own.points].some((n) => backing.shares.percent.has(n) && !backing.shares.points.has(n))) return false;
  return true;
}
