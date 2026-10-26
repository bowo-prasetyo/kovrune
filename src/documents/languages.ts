// Which language a Latin-script text is in, from its function words: enough to notice an
// answer in English to a question in French, not a general language detector. Texts too
// short or too mixed to tell get no language.

import { mainScript, words } from "./scripts.ts";

/**
 * Common function words, accent-folded as words() returns them ("été" is "ete"). One-letter words
 * ("a", "y", "e") are left out: several languages share them. The lists favour words that tell
 * languages apart: Spanish "de", "la" and "en" are left out, so a short French question such as
 * "Combien de visiteurs la tour a-t-elle accueillis en 2016 ?" still reads as French.
 */
const FUNCTION_WORDS: Record<string, string> = {
  English: "the and of to is are was were in that this it for on with as by not be have has from or which what how does do at an about there their they can who when",
  French: "le la les des du de un une et est sont dans en pour sur avec par que qui quel quelle quels quelles ne pas au aux ce cette ces son sa ses ont ete il elle combien comment ou plus",
  German: "der die das und ist sind nicht ein eine einen dem den des mit von zu auf fur im wie welche welcher wann wurde auch es sich",
  Spanish: "el los las del es son una uno por para con que cual como cuando esta este se lo",
  Italian: "il lo gli della delle dei di sono una uno per con che quale come quando non nel nella del ha",
  Portuguese: "os do da dos das um uma para com que qual como quando nao sao foi em na",
  Dutch: "de het een en van is zijn niet met voor op dat die wat hoe welke wanneer ook er",
};
const LISTS = Object.entries(FUNCTION_WORDS).map(([language, list]) => [language, new Set(list.split(" "))] as const);

/** A language is named only with at least this many function words, and this many times the runner-up's. */
const MIN_HITS = 3;
const MIN_LEAD = 2;

/**
 * The language of a Latin-script text, or undefined when it has too few function words or two
 * languages come close (the lists share words such as "de", "la" and "que").
 */
export function latinLanguage(text: string): string | undefined {
  // "a-t-elle" and "Jean-Paul" are one word to search, but their parts are what tell the language.
  const tokens = words(text).flatMap((word) => word.split("-"));
  const [first, second] = LISTS.map(([language, list]) => ({ language, hits: tokens.filter((t) => list.has(t)).length })).sort(
    (a, b) => b.hits - a.hits,
  );
  if (!first || first.hits < MIN_HITS || first.hits < MIN_LEAD * (second?.hits ?? 0)) return undefined;
  return first.language;
}

/**
 * The language a document is written in, named for the model: "Japanese" (Han with kana),
 * "Chinese" (Han without), "Korean", the Latin-script languages latinLanguage() tells apart, or
 * a script such as "Cyrillic script". Undefined when it cannot tell.
 */
export function documentLanguage(text: string): string | undefined {
  const main = mainScript(text);
  if (!main) return undefined;
  switch (main.script) {
    case "Latin":
      return latinLanguage(text);
    case "Chinese or Japanese":
      // Japanese writes particles and endings in kana; Chinese has none.
      return /[\p{sc=Hiragana}\p{sc=Katakana}]/u.test(text) ? "Japanese" : "Chinese";
    case "Korean":
      return "Korean";
    default:
      return `${main.script} script`;
  }
}

/** The languages of a set of documents, the most common first, for telling the model what to search in. */
export function documentLanguages(texts: string[]): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const language = documentLanguage(text);
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([language]) => language);
}
