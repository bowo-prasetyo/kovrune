/**
 * Case- and whitespace-insensitive phrase matching with alphanumeric boundaries.
 *
 * Evaluation facts often contain short numbers, acronyms, or names. Plain substring matching
 * lets "4" match "14", "MPL" match "AMPL", and "born" match "unborn", inflating retrieval and
 * report-completeness scores. Numeric-only facts may be followed by an attached unit (4GB),
 * but never by another digit. Punctuation remains meaningful for decimals and version IDs.
 */
export function containsPhrase(text: string, phrase: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "").trim();
  const needle = normalize(phrase);
  if (!needle) return false;
  const escaped = needle.split(/\s+/u).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const numericOnly = /^\p{N}+$/u.test(needle);
  const rightBoundary = numericOnly ? "(?!\\p{N})" : "(?![\\p{L}\\p{N}])";
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}${rightBoundary}`, "iu").test(normalize(text));
}

/**
 * Report-plan keywords include deliberate stems (e.g. "marri" for "married").
 * Match those as prefixes of whole tokens, never as arbitrary interior substrings.
 */
export function containsKeyword(text: string, keyword: string): boolean {
  const tokenize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const words = tokenize(text);
  const parts = tokenize(keyword);
  if (!parts.length || parts.length > words.length) return false;
  return words.some((_, start) => parts.every((part, offset) => words[start + offset]?.startsWith(part)));
}
