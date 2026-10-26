import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateTokens } from "../src/agent/agent.ts";
import { checkEvidence, quoteContext } from "../src/agent/evidence.ts";
import { sentenceSupport, splitSentences } from "../src/agent/support.ts";
import { chunkDocument, CHUNK_CHARS } from "../src/documents/chunk.ts";
import { dropUnspacedGaps, foldText, textWeight, words } from "../src/documents/scripts.ts";
import { DocumentIndex } from "../src/tools/search.ts";

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
