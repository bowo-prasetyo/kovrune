import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runAgent } from "../src/agent/agent.ts";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { describeCall } from "../src/app/research/trace.ts";
import { latinLanguage } from "../src/documents/languages.ts";
import { mainScript } from "../src/documents/scripts.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";
import { createResearchTools, languageMismatch, RESEARCH_SYSTEM } from "../src/tools/research.ts";
import { corpus } from "../eval/tasks/corpus.ts";

class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 4096 };
  readonly requests: GenerationRequest[] = [];
  private readonly replies: string[];
  constructor(replies: string[]) {
    this.replies = replies;
  }
  supportsConstrainedDecoding() {
    return true;
  }
  async *generate(request: GenerationRequest) {
    this.requests.push(request);
    yield { text: this.replies.shift() ?? "{}", done: false };
    yield { text: "", done: true, usage: { promptTokens: 100, completionTokens: 20 } };
  }
  async dispose() {}
}

const library = new ResearchLibrary(corpus);
const search = (query: string) => JSON.stringify({ tool: "search", args: { query } });
const read = (docId: string) => JSON.stringify({ tool: "read", args: { docId } });
const notFound = JSON.stringify({ tool: "final_answer", args: { found: false, answer: "The documents do not say.", evidence: [] } });
const steps = (calls: Array<{ tool?: string; rejected?: string }>) => calls.map((c) => `${c.tool}${c.rejected ? " (rejected)" : ""}`);

describe("read before not found", () => {
  it("sends a not-found answer back once when the search found documents that were not read (field f19, f30)", async () => {
    const model = new ScriptedModel([search("LumenDB maintainer"), notFound, read("lumen-overview"), notFound]);
    const result = await runResearch({ question: "Who maintains LumenDB?", library, model });
    assert.deepEqual(steps(result.agent.calls), ["search", "final_answer (rejected)", "read", "final_answer"]);
    assert.equal(result.agent.stopReason, "final");
    assert.equal(result.status, "not-found", "after reading, the model may still conclude that the answer is not there");
    // system, question, search, its result, the rejected answer, then the objection the read follows.
    assert.equal(result.agent.transcript[5]!.role, "user");
    assert.match(result.agent.transcript[5]!.content, /read what your search found: each snippet is only one sentence/);
  });

  it("asks only once", async () => {
    // The model ignores the request and concludes again without reading: the second answer stands.
    const model = new ScriptedModel([search("LumenDB maintainer"), notFound, notFound]);
    const result = await runResearch({ question: "Who maintains LumenDB?", library, model });
    assert.deepEqual(steps(result.agent.calls), ["search", "final_answer (rejected)", "final_answer"]);
    assert.equal(result.status, "not-found");
  });

  it("lets not-found through when the search found nothing, or after a read", async () => {
    const nothing = await runResearch({ question: "q", library, model: new ScriptedModel([search("zzzqqq"), notFound]) });
    assert.deepEqual(steps(nothing.agent.calls), ["search", "final_answer"]);
    const afterRead = await runResearch({
      question: "q",
      library,
      model: new ScriptedModel([search("LumenDB maintainer"), read("lumen-overview"), notFound]),
    });
    assert.deepEqual(steps(afterRead.agent.calls), ["search", "read", "final_answer"]);
  });

  it("does not object to an answer from a document that was read, or on the last step", async () => {
    const found = JSON.stringify({
      tool: "final_answer",
      args: { found: true, answer: "The Tessel Foundation maintains LumenDB.", evidence: [{ docId: "lumen-overview", quote: "maintained by the Tessel Foundation since 2022" }] },
    });
    const answered = await runResearch({
      question: "Who maintains LumenDB?",
      library,
      model: new ScriptedModel([search("LumenDB maintainer"), read("lumen-overview"), found]),
    });
    assert.deepEqual(steps(answered.agent.calls), ["search", "read", "final_answer"]);

    const lastStep = await runAgent({
      model: new ScriptedModel([search("LumenDB maintainer"), notFound]),
      system: RESEARCH_SYSTEM,
      task: "Who maintains LumenDB?",
      tools: createResearchTools(library.index),
      finalTool: "final_answer",
      config: { constrained: true, maxCalls: 2, maxTokensPerCall: 512 },
    });
    assert.equal(lastStep.stopReason, "final", "with no steps left, the model must be able to finish");
    assert.deepEqual(steps(lastStep.calls), ["search", "final_answer"]);
  });

  it("says in the trace that the model was sent back to read", async () => {
    const result = await runResearch({
      question: "Who maintains LumenDB?",
      library,
      model: new ScriptedModel([search("LumenDB maintainer"), notFound, read("lumen-overview"), notFound]),
    });
    assert.match(describeCall(result.agent.calls[1]!, () => undefined), /reading what the search found first/);
    const call = { valid: true, tool: "final_answer", args: { found: false }, rejected: "a step", promptTokens: 0, completionTokens: 0, estimatedTokens: false, ttftMs: 0, totalMs: 0 };
    assert.equal(describeCall(call, () => undefined), "a step");
  });
});

describe("reply in the question's language", () => {
  const fuji = new ResearchLibrary([{ id: "fuji", title: "富士山", text: "富士山は日本の活火山である。山体の最高地点は3776.12 mである。" }]);
  const answer = (text: string, found = true) =>
    JSON.stringify({ tool: "final_answer", args: { found, answer: text, evidence: found ? [{ docId: "fuji", quote: "山体の最高地点は3776.12 mである。" }] : [] } });
  const ask = (replies: string[]) =>
    runResearch({ question: "富士山の山体の最高地点は何メートルですか？", library: fuji, model: new ScriptedModel([search("富士山 最高地点"), read("fuji"), ...replies]) });

  it("tells writing systems apart, by weight", () => {
    assert.deepEqual(mainScript("The provided documents do not say."), { script: "Latin", weight: 28 });
    assert.equal(mainScript("山梨県と静岡県")!.script, "Chinese or Japanese");
    assert.equal(mainScript("Москва")!.script, "Cyrillic");
    assert.equal(mainScript("1987"), undefined);
  });

  it("sends an English answer to a Japanese question back once (field f28)", async () => {
    const english = answer("The highest point of Mount Fuji is 3776.12 m.");
    const result = await ask([english, answer("富士山の最高地点は3776.12 mです。")]);
    assert.deepEqual(steps(result.agent.calls), ["search", "read", "final_answer (rejected)", "final_answer"]);
    assert.match(result.agent.transcript.at(-2)!.content, /written in Chinese or Japanese script, but your answer is in Latin script.*keep each quote exactly/);
    assert.match(describeCall(result.agent.calls[2]!, () => undefined), /another language than the question/);
    assert.equal(result.final!.answer, "富士山の最高地点は3776.12 mです。");
    assert.equal(result.status, "verified");

    const again = await ask([english, english]);
    assert.deepEqual(steps(again.agent.calls), ["search", "read", "final_answer (rejected)", "final_answer"], "asked once");
  });

  it("checks not-found answers too, but not short ones or answers in the question's script", async () => {
    const notFoundEnglish = await ask([answer("The provided documents do not contain this information.", false), answer("文書には記載がありません。", false)]);
    assert.deepEqual(steps(notFoundEnglish.agent.calls), ["search", "read", "final_answer (rejected)", "final_answer"]);
    for (const text of ["3776.12 m", "3776.12メートルです。"]) {
      const result = await ask([answer(text)]);
      assert.deepEqual(steps(result.agent.calls), ["search", "read", "final_answer"], text);
    }
  });

  it("leaves an English answer to an English question alone", async () => {
    const english = await runResearch({
      question: "Who maintains LumenDB?",
      library,
      model: new ScriptedModel([
        search("LumenDB maintainer"),
        read("lumen-overview"),
        JSON.stringify({ tool: "final_answer", args: { found: true, answer: "LumenDB is maintained by the Tessel Foundation.", evidence: [{ docId: "lumen-overview", quote: "maintained by the Tessel Foundation since 2022" }] } }),
      ]),
    });
    assert.deepEqual(steps(english.agent.calls), ["search", "read", "final_answer"]);
  });
});

describe("reply in the question's language, in Latin script", () => {
  it("tells the languages apart by their function words", () => {
    assert.equal(latinLanguage("Quelle est la hauteur de la tour Eiffel avec ses antennes ?"), "French");
    assert.equal(latinLanguage("Combien de visiteurs la tour Eiffel a-t-elle accueillis en 2016 ?"), "French", "a-t-elle counts as its parts");
    assert.equal(latinLanguage("The provided documents do not contain the price of a ticket."), "English");
    assert.equal(latinLanguage("Wann wurde die Straße für den Verkehr geöffnet?"), "German");
    assert.equal(latinLanguage("¿Cuándo se abrió la torre para los visitantes?"), "Spanish");
    assert.equal(latinLanguage("Quando è stata costruita la torre e per quale motivo?"), "Italian");
    assert.equal(latinLanguage("Quando foi construída a torre e qual é a altura dos andares?"), "Portuguese");
    assert.equal(latinLanguage("Wanneer is de toren gebouwd en wat is de hoogte van het dak?"), "Dutch");
  });

  it("names no language for short or mixed text", () => {
    assert.equal(latinLanguage("330 mètres"), undefined);
    assert.equal(latinLanguage("Which organization maintains LumenDB?"), undefined, "one function word is not enough");
    assert.equal(latinLanguage("It is called « la tour de 300 mètres »."), undefined, "an English sentence quoting French");
  });

  it("finds an English answer to a French question, and nothing in answers in the question's language", () => {
    const question = "Pour quel événement la tour Eiffel a-t-elle été construite ?";
    assert.deepEqual(languageMismatch(question, "The tower was built for the 1889 Exposition universelle in Paris."), { asked: "French", wrote: "English" });
    assert.equal(languageMismatch(question, "La tour Eiffel a été construite pour l'Exposition universelle de 1889."), undefined);
    assert.equal(languageMismatch(question, "Exposition universelle de 1889"), undefined, "too few function words to tell");
    assert.equal(languageMismatch("Who maintains LumenDB?", "The Tessel Foundation maintains LumenDB."), undefined, "the question is too short to tell");
  });

  it("sends an English answer to a French question back once", async () => {
    const eiffel = new ResearchLibrary([{ id: "eiffel", title: "Tour Eiffel", text: "Construite pour l'Exposition universelle de Paris de 1889, elle est devenue le symbole de la capitale." }]);
    const quote = "Construite pour l'Exposition universelle de Paris de 1889";
    const final = (text: string) => JSON.stringify({ tool: "final_answer", args: { found: true, answer: text, evidence: [{ docId: "eiffel", quote }] } });
    const result = await runResearch({
      question: "Pour quel événement la tour Eiffel a-t-elle été construite ?",
      library: eiffel,
      model: new ScriptedModel([
        search("tour Eiffel construite"),
        read("eiffel"),
        final("The tower was built for the 1889 Exposition universelle in Paris."),
        final("La tour Eiffel a été construite pour l'Exposition universelle de Paris de 1889."),
      ]),
    });
    assert.deepEqual(steps(result.agent.calls), ["search", "read", "final_answer (rejected)", "final_answer"]);
    assert.match(result.agent.transcript.at(-2)!.content, /^The question is written in French, but your answer is in English\./);
    assert.equal(result.status, "verified");
  });
});

describe("read before answering", () => {
  const answer = (docId: string, quote: string) =>
    JSON.stringify({ tool: "final_answer", args: { found: true, answer: "The Tessel Foundation maintains LumenDB.", evidence: [{ docId, quote }] } });
  const fromSnippet = answer("lumen-overview", "maintained by the Tessel Foundation since 2022");

  it("sends an answer back once when it quotes a document the model only saw as a snippet (pdf task p04)", async () => {
    const model = new ScriptedModel([search("LumenDB maintainer"), fromSnippet, read("lumen-overview"), fromSnippet]);
    const result = await runResearch({ question: "Who maintains LumenDB?", library, model });
    assert.deepEqual(steps(result.agent.calls), ["search", "final_answer (rejected)", "read", "final_answer"]);
    assert.match(result.agent.transcript[5]!.content, /quotes lumen-overview, which you have seen only as a search snippet/);
    assert.equal(result.agent.calls[1]!.rejected, "About to answer from search snippets; reading the documents it quotes first");
    assert.equal(result.status, "verified");
  });

  it("asks only once, and not on the last step", async () => {
    const ignored = await runResearch({ question: "q", library, model: new ScriptedModel([search("LumenDB maintainer"), fromSnippet, fromSnippet]) });
    assert.deepEqual(steps(ignored.agent.calls), ["search", "final_answer (rejected)", "final_answer"]);
    const lastStep = await runAgent({
      model: new ScriptedModel([search("LumenDB maintainer"), fromSnippet]),
      system: RESEARCH_SYSTEM,
      task: "Who maintains LumenDB?",
      tools: createResearchTools(library.index),
      finalTool: "final_answer",
      config: { constrained: true, maxCalls: 2, maxTokensPerCall: 512 },
    });
    assert.deepEqual(steps(lastStep.calls), ["search", "final_answer"]);
  });

  it("counts a part as read only when that part was, and a whole document when any part was", async () => {
    const long = { id: "manual", title: "Manual", text: Array.from({ length: 4 }, (_, i) => `Chapter ${i + 1}. ${"The manual explains the backup schedule in detail. ".repeat(12)}`).join("\n\n") };
    const parts = new ResearchLibrary([long]);
    const [first, second] = parts.index.partsOf("manual");
    assert.ok(first && second);
    const quote = "The manual explains the backup schedule in detail.";
    const otherPart = await runResearch({ question: "q", library: parts, model: new ScriptedModel([read(first), answer(second, quote), answer(second, quote)]) });
    assert.deepEqual(steps(otherPart.agent.calls), ["read", "final_answer (rejected)", "final_answer"], "reading part 1 does not cover a quote from part 2");
    const whole = await runResearch({ question: "q", library: parts, model: new ScriptedModel([read(first), answer("manual", quote)]) });
    assert.deepEqual(steps(whole.agent.calls), ["read", "final_answer"], "a quote cited to the whole document is covered by any part");
  });

  it("does not object to an answer that says the documents do not have it", async () => {
    const result = await runResearch({ question: "q", library, model: new ScriptedModel([search("zzzqqq"), notFound]) });
    assert.deepEqual(steps(result.agent.calls), ["search", "final_answer"]);
  });
});
