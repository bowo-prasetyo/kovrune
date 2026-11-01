import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CheckedEvidence } from "../src/agent/evidence.ts";
import {
  answeredSections,
  parseSynthesis,
  SYNTHESIS_ANSWER_CHARS,
  synthesisBacking,
  synthesisPrompt,
  writeSynthesis,
  writesSynthesis,
  type SynthesisSection,
} from "../src/agent/synthesis.ts";
import { answerToMarkdown, type SavedAnswer } from "../src/app/research/answers.ts";
import { makeBackup, parseBackup } from "../src/app/research/backup.ts";
import { describeSynthesisBacking, toSavedReport } from "../src/app/research/report.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";

class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 4096 };
  readonly requests: GenerationRequest[] = [];
  private readonly reply: string | Error;
  constructor(reply: string | Error) {
    this.reply = reply;
  }
  supportsConstrainedDecoding() {
    return true;
  }
  async *generate(request: GenerationRequest) {
    this.requests.push(request);
    if (this.reply instanceof Error) throw this.reply;
    yield { text: this.reply, done: false };
    yield { text: "", done: true };
  }
  async dispose() {}
}

const quote = (docId: string, text: string, verified = true): CheckedEvidence => ({ docId, quote: text, verified }) as CheckedEvidence;

const sections: SynthesisSection[] = [
  {
    question: "Who were Ada Lovelace's parents?",
    answer: "Ada Lovelace was the only legitimate child of the poet Lord Byron and Anne Isabella Milbanke.",
    status: "verified",
    evidence: [quote("ada", "Lovelace was the only legitimate child of poet Lord Byron and reformer Anne Isabella Milbanke.")],
  },
  {
    question: "What did she write about the Analytical Engine?",
    answer: "Her notes on the Analytical Engine include an algorithm to compute Bernoulli numbers.",
    status: "verified",
    evidence: [quote("ada", "Her notes on the Analytical Engine include what is recognised as the first algorithm intended to compute Bernoulli numbers.")],
  },
  { question: "Whom did she marry?", status: "not-found", evidence: [] },
  { question: "Where is she buried?", answer: "", status: "no-answer", evidence: [] },
];
const reply = (introduction: string, conclusion: string) => JSON.stringify({ introduction, conclusion });

describe("report mode: the introduction and conclusion (slice 5)", () => {
  it("draws only on sections that found an answer, and shows each answer cut to its size", () => {
    assert.deepEqual(
      answeredSections(sections).map((s) => s.question),
      ["Who were Ada Lovelace's parents?", "What did she write about the Analytical Engine?"],
    );
    const prompt = synthesisPrompt("Ada Lovelace", "Write a short biography of Ada Lovelace.", answeredSections(sections));
    assert.match(prompt, /^Report: Ada Lovelace\nRequest: Write a short biography of Ada Lovelace\.\n\nSections:\n1\. Who were Ada Lovelace's parents\?\nAda Lovelace was the only/);
    assert.match(prompt, /Use only what the sections say/);
    assert.doesNotMatch(prompt, /Whom did she marry/);
    const long = synthesisPrompt("T", "R", [{ question: "Q?", answer: "word ".repeat(1000), status: "verified", evidence: [] }]);
    assert.ok(long.length < SYNTHESIS_ANSWER_CHARS + 600, `${long.length}`);
    assert.match(long, / …\n/);
  });

  it("checks each sentence against all the sections' verified quotes, and marks what they don't back", async () => {
    const model = new ScriptedModel(
      reply(
        "This report covers the life of Ada Lovelace. Ada Lovelace was the only legitimate child of Lord Byron and Anne Isabella Milbanke.",
        "Her notes on the Analytical Engine include an algorithm to compute Bernoulli numbers. She is remembered today as a pioneer of modern computing.",
      ),
    );
    const synthesis = await writeSynthesis({ model, title: "Ada Lovelace", request: "Write a short biography of Ada Lovelace.", sections, titleFor: () => "Ada Lovelace" });
    assert.ok(synthesis);
    assert.deepEqual(
      synthesis.introduction.support.sentences.map((s) => s.backed),
      [false, true],
      "a sentence about the report itself is not backed by any quote, and is marked as such",
    );
    assert.deepEqual(synthesis.conclusion.support.sentences.map((s) => s.backed), [true, false], "a claim the sections never made is marked");
    assert.deepEqual(synthesisBacking(synthesis), { judged: 4, backed: 2 });
    assert.equal(describeSynthesisBacking(synthesis), "2 of their 4 sentences are backed by a section's quote; ⚠ marks the others.");
    const request = model.requests[0]!;
    assert.ok(request.responseSchema, "the reply is constrained to the JSON asked for");
    assert.equal(request.temperature, 0);
  });

  it("writes nothing for fewer than two answered sections, an unreadable reply, or a failed call", async () => {
    const good = reply("An introduction about Lord Byron's daughter.", "A conclusion about her notes.");
    const one = new ScriptedModel(good);
    assert.equal(await writeSynthesis({ model: one, title: "T", request: "R", sections: sections.slice(0, 1) }), undefined);
    assert.equal(one.requests.length, 0, "no call is made");
    for (const bad of ["no json", reply("", "Only a conclusion."), new Error("server error")]) {
      assert.equal(await writeSynthesis({ model: new ScriptedModel(bad), title: "T", request: "R", sections }), undefined);
    }
    assert.deepEqual(parseSynthesis(`<think>x</think> ${good}`), JSON.parse(good));
  });

  it("stops when the user stops it", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(writeSynthesis({ model: new ScriptedModel(new Error("aborted")), title: "T", request: "R", sections, signal: controller.signal }));
  });

  it("is off by default for every model until it is measured (decision R4)", () => {
    for (const id of ["qwen3.5-2b-q4km", "qwen3.5-4b-q4km", "Qwen3.5-4B-q4f16_1-MLC"]) assert.equal(writesSynthesis(id), false, id);
  });

  it("is saved with the report, exported around the sections, and kept by a backup", async () => {
    const synthesis = (await writeSynthesis({
      model: new ScriptedModel(reply("This report covers the life of Ada Lovelace.", "Her notes on the Analytical Engine include an algorithm to compute Bernoulli numbers.")),
      title: "Ada Lovelace",
      request: "R",
      sections,
    }))!;
    const saved: SavedAnswer[] = sections.slice(0, 2).map((s, i) => ({
      id: `s${i}`,
      question: s.question,
      askedAt: "2026-11-01T12:00:00Z",
      model: "m",
      status: "verified",
      answer: s.answer,
      evidence: s.evidence,
      citations: {},
      titles: { ada: "Ada Lovelace.txt" },
      sourceErrors: [],
      steps: [],
    }));
    const record = toSavedReport({
      id: "r",
      askedAt: "2026-11-01T12:00:00Z",
      model: "m",
      plan: { title: "Ada Lovelace", sections: sections.slice(0, 2).map((s) => s.question) },
      request: "R",
      sections: saved,
      synthesis,
    });
    assert.deepEqual(record.report!.synthesis, synthesis);
    const md = answerToMarkdown(record);
    const at = (text: string) => md.indexOf(text);
    assert.ok(at("## Introduction\n\n⚠ This report covers the life of Ada Lovelace.") > 0, md);
    assert.ok(at("## Introduction") < at("## 1. Who were") && at("## 2. What did") < at("## Conclusion\n\nHer notes on the Analytical Engine"), md);
    assert.match(md, /_The introduction and conclusion are written by the model from the sections' answers, without new reading\./);
    assert.match(md, /⚠ marks sentences that share few words/);
    const back = parseBackup(JSON.stringify(makeBackup([], [record], new Date("2026-11-01T12:00:00Z"))));
    assert.deepEqual(back.answers[0], record);
    const broken = { ...record, report: { ...record.report!, synthesis: { introduction: { text: 1 } } } };
    assert.throws(() => parseBackup(JSON.stringify(makeBackup([], [broken as unknown as SavedAnswer]))), /damaged/);
  });
});
