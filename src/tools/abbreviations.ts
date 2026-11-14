// Abbreviations a library defines, so a search in words finds a passage that has only the abbreviation,
// and the reverse (harness 0.68.0). Engineering and scientific writing defines an abbreviation once, as
// "zero-voltage switching (ZVS)", and uses only "ZVS" after; a keyword search for "zero-voltage switching"
// then misses every later passage, and one for "FEA" misses the passage that defines it.
//
// Definitions are found with the algorithm of Schwartz and Hearst ("A simple algorithm for identifying
// abbreviation definitions in biomedical text", PSB 2003): a short form in brackets, and a long form among
// the words before it whose letters hold the short form's characters in order, the first at a word's start.

/** An abbreviation and the words it stands for, as the text writes them. */
export interface Definition {
  short: string;
  long: string;
}

/**
 * A short form is 2 to 10 characters, one or two words, each starting with a capital letter or a digit
 * ("S Typhi", not "by RDT"), and has a capital letter.
 */
function isShortForm(text: string): boolean {
  const words = text.split(/\s+/);
  return text.length >= 2 && text.length <= 10 && words.length <= 2 && words.every((w) => /^[\p{Lu}\p{N}]/u.test(w) || words.length === 1) && /^[\p{L}\p{N}]/u.test(text) && /\p{Lu}/u.test(text);
}

const alnum = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/**
 * The long form among `words` that `short` abbreviates (Schwartz and Hearst): going right to left, each
 * letter or digit of the short form is found in the words, the first one at the start of a word. Undefined
 * when there is none, or when the long form is no longer than the short form or contains it.
 */
export function longFormOf(short: string, words: string): string | undefined {
  const [s, l] = [short.toLowerCase(), words.toLowerCase()];
  let li = l.length - 1;
  for (let si = s.length - 1; si >= 0; si--) {
    const ch = s[si]!;
    if (!alnum(ch)) continue;
    while (li >= 0 && (l[li] !== ch || (si === 0 && li > 0 && alnum(l[li - 1])))) li--;
    if (li < 0) return undefined;
    li--;
  }
  const long = words.slice(l.lastIndexOf(" ", li) + 1).trim();
  if (long.length <= short.length || long.toLowerCase().includes(s) || /[()]/.test(long)) return undefined;
  return long;
}

/** The definitions a text gives as "long form (SF)". */
export function definitions(text: string): Definition[] {
  const found: Definition[] = [];
  for (const match of text.matchAll(/\(([^()\n]{2,24})\)/g)) {
    const short = match[1]!.split(/[;,]/)[0]!.trim();
    if (!isShortForm(short)) continue;
    // The words before the bracket, in the same sentence: at most the short form's length plus five, and twice its length.
    const before = text.slice(Math.max(0, match.index - 400), match.index);
    const clause = before.split(/[.!?;:](?:\s|$)|\n\s*\n|\(/).at(-1)!.trim();
    const limit = Math.min(short.length + 5, short.length * 2);
    const long = longFormOf(short, clause.split(/\s+/).slice(-limit).join(" "));
    if (long) found.push({ short, long });
  }
  return found;
}
