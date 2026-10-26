// Writing systems, for search, quote checks and chunking. English, other European languages,
// Russian and Hindi separate words with spaces; Chinese, Japanese, Thai and a few others do
// not, so a word boundary can fall between any two of their characters. Korean uses spaces,
// but particles attach to words ("서울은" is "Seoul" plus a topic marker), so it is treated
// like them for matching.

/** Scripts written without spaces between words. 々 and ー are Common-script characters inside Japanese words. */
const UNSPACED = "\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}\\p{sc=Hangul}\\p{sc=Thai}\\p{sc=Lao}\\p{sc=Khmer}\\p{sc=Myanmar}\\u3005\\u30fc";
const UNSPACED_CHAR = new RegExp(`[${UNSPACED}]`, "u");
const UNSPACED_ALL = new RegExp(`[${UNSPACED}]`, "gu");
const WORD_CHAR = `(?:(?![${UNSPACED}])[\\p{L}\\p{M}\\p{N}])`;
/** A run of unspaced-script characters, or a word: letters, marks and digits, joined across "." and "-" ("3.2", "key-value"). */
const TOKEN = new RegExp(`[${UNSPACED}]+|${WORD_CHAR}+(?:[.-]${WORD_CHAR}+)*`, "gu");

/** Unspaced-script characters and CJK punctuation ("。", "「"), between which whitespace means nothing. */
const UNSPACED_GAP = new RegExp(`([${UNSPACED}\\u3000-\\u303f])\\s+(?=[${UNSPACED}\\u3000-\\u303f])`, "gu");

/**
 * Drops whitespace between two characters of unspaced scripts. It means nothing there: PDF
 * extraction puts line breaks inside Japanese words, and chunking can join two pieces of a run
 * with a space. Korean loses its spaces too, which quote matching does on both sides alike.
 */
export function dropUnspacedGaps(text: string): string {
  return text.replace(UNSPACED_GAP, "$1");
}

/** Whether a character belongs to a script written without spaces between words. */
export function isUnspaced(ch: string | undefined): boolean {
  return ch !== undefined && UNSPACED_CHAR.test(ch);
}

/**
 * Text as search compares it: compatibility forms unified (full-width letters, ligatures), lower
 * case, and accents dropped from Latin and Greek letters, so "energie" finds "énergie". "ß" is
 * "ss" and Cyrillic "ё" is "е", as people often type them. Plain ASCII is only lower-cased.
 */
export function foldText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/([\p{sc=Latin}\p{sc=Greek}])\p{M}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ё/g, "е");
}

/**
 * The words of a text, folded (foldText). A run of an unspaced script gives each character and
 * each pair of neighbouring characters ("東京都" gives 東, 京, 都, 東京, 京都), as search engines
 * index Chinese and Japanese, so a word matches inside a run without a dictionary. For English
 * this gives the same words as matching [a-z0-9] on the lower-cased text.
 */
export function words(text: string): string[] {
  const out: string[] = [];
  for (const [token] of foldText(text).matchAll(TOKEN)) {
    if (!isUnspaced(token[0])) {
      out.push(token);
      continue;
    }
    const chars = [...token];
    out.push(...chars);
    for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i]! + chars[i + 1]!);
  }
  return out;
}

/** Writing systems told apart when checking that an answer is in the question's language. */
const SCRIPTS: Array<[string, RegExp]> = [
  ["Latin", /\p{sc=Latin}/u],
  ["Chinese or Japanese", /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\u3005\u30fc]/u],
  ["Korean", /\p{sc=Hangul}/u],
  ["Cyrillic", /\p{sc=Cyrillic}/u],
  ["Greek", /\p{sc=Greek}/u],
  ["Arabic", /\p{sc=Arabic}/u],
  ["Hebrew", /\p{sc=Hebrew}/u],
  ["Devanagari", /\p{sc=Devanagari}/u],
  ["Thai", /\p{sc=Thai}/u],
];

/**
 * The writing system most of a text's letters are in, with their weight (textWeight, so a Chinese
 * character counts like a short English word). Undefined for a text without letters, such as "1987".
 */
export function mainScript(text: string): { script: string; weight: number } | undefined {
  const weights = new Map<string, number>();
  for (const ch of text) {
    const script = SCRIPTS.find(([, pattern]) => pattern.test(ch))?.[0];
    if (script) weights.set(script, (weights.get(script) ?? 0) + textWeight(ch));
  }
  const [script, weight] = [...weights].sort((a, b) => b[1] - a[1])[0] ?? [];
  return script ? { script, weight: weight! } : undefined;
}

/** How many characters of a text belong to unspaced scripts. */
export function unspacedCount(text: string): number {
  return text.match(UNSPACED_ALL)?.length ?? 0;
}

/**
 * A text's length in English-equivalent characters, for budgets set in characters: about 3.5
 * English characters make a token, but each Chinese or Japanese character is about one token
 * on its own, so it counts as 3.5. English text weighs exactly its length.
 */
export function textWeight(text: string): number {
  return text.length + 2.5 * unspacedCount(text);
}
