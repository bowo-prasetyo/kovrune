// Crystallographic notation in one form (harness 0.107.0, docs/materials-science-audit.md, MS8), for matching
// quotes (agent/evidence.ts) and for search (tools/search.ts):
// - a digit under a bar is the digit with a minus before it, as crystallographers type a bar they cannot
//   print: the Miller index "(1̄10)" is "(-110)", and the space group "Fm3̄m" is "Fm-3m";
// - a Hermann–Mauguin symbol written with spaces, as a CIF file writes it ("F m -3 m", "P 63/m m c",
//   "P 21/c"), is the symbol run together, as papers write it ("Fm-3m", "P63/mmc", "P21/c").
// Before, a quote of "Fm-3m" was not found in "Fm3̄m" or in a CIF's "F m -3 m", and a search for
// "Fm-3m" found neither.

/** A digit with a combining macron or overline over it: "3̄". */
const BARRED = /(\p{Nd})[̄̅]/gu;

/** A text with each barred digit written as a minus and the digit, "3̄" as "-3": one character for one, so offsets hold. */
export function barsAsMinus(text: string): string {
  return text.includes("̄") || text.includes("̅") ? text.replace(BARRED, "-$1") : text;
}

/**
 * A Hermann–Mauguin symbol written with spaces: a lattice letter, then one to four parts, each an axis
 * ("3", "-3", "63", "21/c", "4/m") or a plane ("m", "c", "n/m"). At least one part must have a bar, a slash or
 * a plane's letter, so "P 1" and "C 2" in ordinary text are left alone.
 */
const SPACED_SYMBOL = /(?<![\p{L}\p{Nd}])[PIFCABR](?: (?:-?\p{Nd}{1,2}(?:\/[mnabcde])?|[mnabcde](?:\/[mnabcde])?)){1,4}(?![\p{L}\p{Nd}/])/gu;
const SYMBOL_PART = /[-/mnabcde]/;

/**
 * A text with its spaced Hermann–Mauguin symbols run together, each space inside one replaced by `joiner`:
 * "" for search, or a zero-width space for quote matching, which keeps offsets and which matching ignores.
 */
export function spacedSymbolsJoined(text: string, joiner = ""): string {
  return text.replace(SPACED_SYMBOL, (symbol) => (SYMBOL_PART.test(symbol.slice(1)) ? symbol.replace(/ /g, joiner) : symbol));
}

/** Crystallographic notation in one form: bars as minus signs, spaced symbols run together (with `joiner` for their spaces). */
export function crystallographic(text: string, joiner = ""): string {
  return spacedSymbolsJoined(barsAsMinus(text), joiner);
}
