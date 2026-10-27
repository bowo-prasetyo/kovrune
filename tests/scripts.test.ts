import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateTokens } from "../src/agent/agent.ts";
import { checkEvidence, quoteContext } from "../src/agent/evidence.ts";
import { sentenceSupport, splitSentences } from "../src/agent/support.ts";
import { chunkDocument, CHUNK_CHARS } from "../src/documents/chunk.ts";
import { dropUnspacedGaps, foldText, textWeight, words } from "../src/documents/scripts.ts";
import { DocumentIndex } from "../src/tools/search.ts";
import { documentLanguage, documentLanguages } from "../src/documents/languages.ts";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";

const DOCS = [
  { id: "ja", title: "東京", text: "東京は日本の首都です。人口は約1400万人です。コーヒーの消費量も多い。" },
  { id: "zh", title: "北京", text: "北京是中华人民共和国的首都。它有三千多年的历史。" },
  { id: "ko", title: "서울", text: "서울은 대한민국의 수도이다. 인구는 약 천만 명이다." },
  { id: "fr", title: "Énergie", text: "La société a réduit sa consommation d'énergie de 12 % en 2023." },
  { id: "de", title: "Straße", text: "Die Straße wurde 1998 für den Verkehr geöffnet." },
  { id: "ru", title: "Москва", text: "Москва является столицей России. Население около 13 миллионов." },
  { id: "hi", title: "दिल्ली", text: "नई दिल्ली भारत की राजधानी है।" },
  { id: "th", title: "กรุงเทพ", text: "กรุงเทพมหานครเป็นเมืองหลวงของประเทศไทย" },
];

describe("words in any script", () => {
  it("splits spaced scripts into words and unspaced ones into characters and pairs", () => {
    assert.deepEqual(words("LumenDB 3.2 uses a key-value store."), ["lumendb", "3.2", "uses", "a", "key-value", "store"]);
    assert.deepEqual(words("東京都"), ["東", "京", "都", "東京", "京都"]);
    assert.deepEqual(words("Tokyo（東京）"), ["tokyo", "東", "京", "東京"]);
    assert.deepEqual(words("नई दिल्ली"), ["नई", "दिल्ली"], "Devanagari vowel signs stay in their word");
  });

  it("folds accents, compatibility forms and case", () => {
    assert.equal(foldText("Énergie GEÖFFNET Straße ＡＢＣ ﬁle Ёлка"), "energie geoffnet strasse abc file елка");
  });

  it("weighs Chinese and Japanese characters as tokens, and English as before", () => {
    assert.equal(textWeight("plain English text"), "plain English text".length);
    assert.equal(textWeight("東京"), 7);
    assert.equal(estimateTokens("a".repeat(35)), 10);
    assert.equal(estimateTokens("東京は日本の首都です"), 10);
  });

  it("drops whitespace between Chinese and Japanese characters only", () => {
    assert.equal(dropUnspacedGaps("首\n都です。 人口 is high"), "首都です。人口 is high");
  });
});

describe("search in other languages", () => {
  const index = new DocumentIndex(DOCS);
  const found = (query: string) => index.search(query).map((hit) => hit.docId);

  it("finds words inside Chinese, Japanese, Korean and Thai text", () => {
    assert.deepEqual(found("首都"), ["zh", "ja"]);
    assert.equal(found("日本の首都")[0], "ja");
    assert.deepEqual(found("コーヒー"), ["ja"]);
    assert.deepEqual(found("수도"), ["ko"]);
    assert.deepEqual(found("서울 인구"), ["ko"], "a word with a particle attached (서울은) is found");
    assert.deepEqual(found("เมืองหลวง"), ["th"]);
  });

  it("finds Cyrillic and Devanagari words, and Latin words with or without accents", () => {
    assert.deepEqual(found("Москва"), ["ru"]);
    assert.deepEqual(found("राजधानी"), ["hi"]);
    assert.deepEqual(found("energie"), ["fr"]);
    assert.deepEqual(found("strasse geoffnet"), ["de"]);
  });

  it("picks a snippet sentence ending with 。", () => {
    assert.equal(index.search("人口")[0]!.snippet, "人口は約1400万人です。");
  });
});

describe("quotes in other languages", () => {
  const check = (quote: string, id: string) => checkEvidence([{ docId: id, quote }], (docId) => DOCS.find((d) => d.id === docId)?.text)[0]!;

  it("verifies quotes from the middle of a sentence without spaces", () => {
    for (const [quote, id] of [
      ["日本の首都です", "ja"],
      ["東京は日本の首都です。", "ja"],
      ["它有三千多年的历史", "zh"],
      ["대한민국의 수도이다", "ko"],
      ["เป็นเมืองหลวงของประเทศไทย", "th"],
      ["भारत की राजधानी है", "hi"],
      ["réduit sa consommation d'énergie", "fr"],
    ]) assert.equal(check(quote!, id!).verified, true, quote);
  });

  it("still rejects short and invented quotes", () => {
    assert.equal(check("東京は", "ja").reason, "quote shorter than 3 words", "two characters count as one word");
    assert.equal(check("大阪は日本の首都です", "ja").verified, false);
    assert.equal(check("수도이다", "ko").reason, "quote shorter than 3 words");
  });

  it("ignores line breaks inside Japanese text, as PDFs have them", () => {
    const pdf = "東京は日本の首\n都です。";
    assert.equal(checkEvidence([{ docId: "d", quote: "東京は日本の首都です" }], () => pdf)[0]!.verified, true);
  });

  it("shows a quote from the middle of a Chinese sentence in its source", () => {
    const context = quoteContext("它有三千多年的历史", DOCS[1]!.text)!;
    assert.equal(context.passage, "它有三千多年的历史");
    assert.equal(context.before, "北京是中华人民共和国的首都。");
  });
});

describe("sentence support in other languages", () => {
  it("splits sentences at 。 and ।", () => {
    assert.deepEqual(splitSentences("東京は日本の首都です。人口は約1400万人です。"), ["東京は日本の首都です。", "人口は約1400万人です。"]);
    assert.deepEqual(splitSentences("नई दिल्ली राजधानी है। यह बड़ा शहर है।"), ["नई दिल्ली राजधानी है। ", "यह बड़ा शहर है।"]);
  });

  it("judges Japanese sentences against the quotes", () => {
    const evidence = checkEvidence([{ docId: "ja", quote: "東京は日本の首都です。" }], () => DOCS[0]!.text);
    const support = sentenceSupport("東京は日本の首都です。人口は約1400万人です。", evidence);
    assert.deepEqual(
      support.sentences.map((s) => s.backed),
      [true, false],
    );
  });
});

describe("chunking text without spaces", () => {
  it("keeps Chinese and Japanese chunks to about 450 tokens, cut after a sentence", () => {
    const text = "これは長い文章です。".repeat(400);
    const chunks = chunkDocument({ id: "jp", title: "長文", text });
    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
      assert.ok(textWeight(chunk.text) <= CHUNK_CHARS, String(textWeight(chunk.text)));
      assert.match(chunk.text, /。$/);
    }
    assert.equal(chunks.map((c) => c.text).join(""), text, "nothing is lost or added");
  });
});

/** A model that replies with these actions in turn. */
function scripted(replies: string[]) {
  return {
    info: { id: "scripted", runtime: "scripted" as const, contextLength: 4096 },
    supportsConstrainedDecoding: () => true,
    async *generate() {
      yield { text: replies.shift() ?? "{}", done: false };
      yield { text: "", done: true, usage: { promptTokens: 1, completionTokens: 1 } };
    },
    dispose: async () => {},
  };
}

describe("documents in several languages", () => {
  it("names each document's language", () => {
    assert.equal(documentLanguage(DOCS[0]!.text), "Japanese", "Han with kana");
    assert.equal(documentLanguage(DOCS[1]!.text), "Chinese", "Han without kana");
    assert.equal(documentLanguage(DOCS[2]!.text), "Korean");
    assert.equal(documentLanguage(DOCS[5]!.text), "Cyrillic script");
    assert.equal(documentLanguage("La tour Eiffel est une tour de fer puddlé de 330 m de hauteur, située à Paris, dans le parc."), "French");
    assert.equal(documentLanguage("1987"), undefined);
    assert.deepEqual(documentLanguages(["The tower is tall and it is in the city.", "It was built in 1889 and it is made of iron.", DOCS[0]!.text]), ["English", "Japanese"]);
  });

  it("sends not-found back once, until the model has searched each document's writing system (f37-f39)", async () => {
    const library = new ResearchLibrary([
      { id: "note", title: "Note", text: "The tower is tall and it is in the city of Paris, and it was built of iron." },
      { id: "fuji", title: "富士山", text: "富士山は日本の活火山である。山体の最高地点は3776.12 mである。" },
    ]);
    assert.deepEqual(library.languages, ["English", "Japanese"]);
    const notFound = JSON.stringify({ tool: "final_answer", args: { found: false, answer: "The documents do not say how high Mount Fuji is.", evidence: [] } });
    const found = JSON.stringify({
      tool: "final_answer",
      args: { found: true, answer: "The highest point of Mount Fuji is 3776.12 m.", evidence: [{ docId: "fuji", quote: "山体の最高地点は3776.12 mである。" }] },
    });
    const model = scripted([
      JSON.stringify({ tool: "search", args: { query: "Mount Fuji height" } }),
      notFound,
      JSON.stringify({ tool: "search", args: { query: "富士山 最高地点" } }),
      JSON.stringify({ tool: "read", args: { docId: "fuji" } }),
      found,
    ]);
    const result = await runResearch({ question: "How high is Mount Fuji?", library, model });
    assert.deepEqual(
      result.agent.calls.map((c) => `${c.tool}${c.rejected ? " (rejected)" : ""}`),
      ["search", "final_answer (rejected)", "search", "read", "final_answer"],
    );
    assert.match(result.agent.transcript[5]!.content, /^Some documents are in Japanese, which search finds only with words in that language\..*translating your search terms into Japanese\.$/);
    assert.match(result.agent.calls[1]!.rejected!, /searching the documents in other languages first/);
    assert.equal(result.status, "verified");
  });

  it("asks once, and not when every writing system was searched, or for a found answer", async () => {
    const english = new ResearchLibrary([{ id: "note", title: "Note", text: "The tower is tall and it is in the city of Paris, and it was built of iron." }]);
    const notFound = JSON.stringify({ tool: "final_answer", args: { found: false, answer: "Not in the documents.", evidence: [] } });
    const search = (query: string) => JSON.stringify({ tool: "search", args: { query } });
    const steps = (calls: Array<{ tool?: string; rejected?: string }>) => calls.map((c) => `${c.tool}${c.rejected ? " (rejected)" : ""}`);
    // One language, searched in its script: the prompt and the run are as before.
    const same = await runResearch({ question: "How old is the tower?", library: english, model: scripted([search("zzzqqq"), notFound]) });
    assert.deepEqual(steps(same.agent.calls), ["search", "final_answer"]);
    // An English library asked in Japanese: searching only in Japanese is sent back to search in English.
    const notFoundJa = JSON.stringify({ tool: "final_answer", args: { found: false, answer: "文書には記載がありません。", evidence: [] } });
    const japanese = await runResearch({ question: "塔はいつ建てられましたか？", library: english, model: scripted([search("塔 建設"), notFoundJa, notFoundJa]) });
    assert.deepEqual(steps(japanese.agent.calls), ["search", "final_answer (rejected)", "final_answer"], "asked once");
    assert.match(japanese.agent.transcript[5]!.content, /^Some documents are in English/);
    // Without a search, there is no language to compare.
    const noSearch = await runResearch({ question: "塔はいつ建てられましたか？", library: english, model: scripted([notFoundJa]) });
    assert.deepEqual(steps(noSearch.agent.calls), ["final_answer"]);
  });
});
