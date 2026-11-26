/**
 * Case- and whitespace-insensitive phrase matching with alphanumeric boundaries.
 *
 * Evaluation facts often contain short numbers, acronyms, or names. Plain substring matching
 * lets "4" match "14", "MPL" match "AMPL", and "born" match "unborn", inflating retrieval and
 * report-completeness scores. Keep punctuation meaningful (e.g. decimal points and hyphens),
 * but require the phrase not to be embedded in a larger word or number.
 */
export function containsPhrase(text: string, phrase: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "").trim();
  const needle = normalize(phrase);
  if (!needle) return false;
  const escaped = needle.split(/\s+/u).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(normalize(text));
}
