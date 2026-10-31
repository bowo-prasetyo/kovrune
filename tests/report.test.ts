import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SECTIONS, fallbackPlan, MAX_SECTIONS, parsePlan, planPrompt, planReport } from "../src/agent/report.ts";
import type { SavedAnswer } from "../src/app/research/answers.ts";
import { makeBackup, parseBackup } from "../src/app/research/backup.ts";
import {
  describeEstimate,
  describeReportLabels,
  labelKind,
  looksLikeReport,
  planEdits,
  planReady,
  reportModeEnabled,
  reportStatus,
  toSavedReport,
  upsert,
} from "../src/app/research/report.ts";
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

const REQUEST = "Please research about blockchain and give me a nice report in 400 words or more.";
const plan = (title: string, questions: string[]) => JSON.stringify({ title, sections: questions.map((question) => ({ question })) });

describe("report mode: the plan (docs/report-mode.md, slice 1)", () => {
  it("asks for focused questions, one per section, from the request and the sources, not the documents", async () => {
    const model = new ScriptedModel(plan("Blockchain", ["What is a blockchain?", "How are blocks linked?", "How is consensus reached?", "What is it used for?"]));
    const result = await planReport({ model, request: REQUEST, sources: ["your documents", "Wikipedia"] });
    assert.deepEqual(result, { title: "Blockchain", sections: ["What is a blockchain?", "How are blocks linked?", "How is consensus reached?", "What is it used for?"] });
    const prompt = model.requests[0]!.messages[1]!.content;
    assert.equal(prompt, planPrompt(REQUEST, ["your documents", "Wikipedia"]));
    assert.match(prompt, /^Request: Please research about blockchain/);
    assert.match(prompt, /Sources to be searched: your documents, Wikipedia/);
    assert.match(prompt, new RegExp(`in ${DEFAULT_SECTIONS} sections`));
    assert.ok(model.requests[0]!.responseSchema, "the reply is constrained to the JSON asked for");
  });

  it("drops empty and repeated questions, keeps at most eight, and needs two", () => {
    assert.deepEqual(parsePlan(plan(" Title ", [" A? ", "", "a?", "B?"])), { title: "Title", sections: ["A?", "B?"] });
    assert.equal(parsePlan(plan("T", Array.from({ length: 10 }, (_, i) => `Q${i}?`)))!.sections.length, MAX_SECTIONS);
    assert.equal(parsePlan(plan("T", ["Only one?"])), undefined);
    assert.equal(parsePlan(plan("", ["A?", "B?"]))!.title, "A?", "an empty title takes the first question");
    assert.equal(parsePlan("no plan"), undefined);
  });

  it("falls back to the request as one section when no plan can be read, or the call fails", async () => {
    for (const reply of ["no plan", plan("T", ["Only one?"]), new Error("server error")]) {
      assert.deepEqual(await planReport({ model: new ScriptedModel(reply), request: ` ${REQUEST} `, sources: ["Wikipedia"] }), fallbackPlan(REQUEST));
    }
    assert.deepEqual(fallbackPlan(REQUEST), { title: REQUEST, sections: [REQUEST], fallback: true });
  });

  it("stops when the user stops it", async () => {
    const controller = new AbortController();
    controller.abort();
    const model = new ScriptedModel(new Error("aborted"));
    await assert.rejects(planReport({ model, request: REQUEST, sources: [], signal: controller.signal }));
  });
});

describe("report mode: the plan screen", () => {
  it("is shown only with ?report in the address until its sections can be researched", () => {
    assert.equal(reportModeEnabled("?report"), true);
    assert.equal(reportModeEnabled("?x=1&report"), true);
    assert.equal(reportModeEnabled(""), false);
  });

  it("estimates the time from the model test, and asks for confirmation above 30 minutes", () => {
    assert.deepEqual(describeEstimate(4, 7), { text: "4 sections, up to 28 min", confirm: false });
    assert.deepEqual(describeEstimate(5, 7), { text: "5 sections, up to 35 min", confirm: true });
    assert.deepEqual(describeEstimate(5, 63), { text: "5 sections, up to 5.3 hours", confirm: true }, "the preview user's 0.6 tokens/s");
    assert.match(describeEstimate(4).text, /test the model/);
  });

  it("notices a question that asks for a report, and only suggests the option", () => {
    assert.equal(looksLikeReport(REQUEST), true);
    assert.equal(looksLikeReport("Write an overview of UML diagrams"), true);
    assert.equal(looksLikeReport("Give me 500 words on SQL naming"), true);
    assert.equal(looksLikeReport("What was the total income in 2024?"), false);
    assert.equal(looksLikeReport("Who reported the bug?"), false);
  });

  it("edits the plan within two to eight sections", () => {
    const start = { title: "T", sections: ["A?", "B?"] };
    assert.deepEqual(planEdits.move(start, 1, -1).sections, ["B?", "A?"]);
    assert.equal(planEdits.move(start, 0, -1), start, "the first section cannot move up");
    assert.deepEqual(planEdits.setQuestion(start, 1, "C?").sections, ["A?", "C?"]);
    let full = start;
    for (let i = 0; i < 10; i++) full = planEdits.add(full);
    assert.equal(full.sections.length, MAX_SECTIONS);
    assert.equal(planReady(planEdits.add(start)), false, "a new section needs a question");
    assert.equal(planReady(start), true);
    assert.equal(planReady(planEdits.remove(start, 0)), false, "one section is not a plan");
    assert.equal(planReady(fallbackPlan(REQUEST)), true, "except the request itself, when no plan could be read");
    assert.equal(planReady(planEdits.setTitle(start, " ")), false);
  });
});

describe("report mode: writing and saving a report (slice 2)", () => {
  const section = (question: string, status: SavedAnswer["status"]): SavedAnswer => ({
    id: question,
    question,
    askedAt: "2026-10-31T12:00:00Z",
    model: "m",
    status,
    ...(status === "no-answer" ? { noAnswer: "The model used all its steps." } : { answer: "An answer." }),
    evidence: [],
    citations: {},
    titles: {},
    sourceErrors: [],
    steps: [],
  });
  const plan = { title: "Blockchain", sections: ["What is it?", "How are blocks linked?", "What is it used for?"] };
  const report = (sections: SavedAnswer[], extra: { unfinished?: boolean; stopped?: boolean } = {}) =>
    toSavedReport({ id: "r", askedAt: "2026-10-31T12:00:00Z", model: "m", plan, request: "blockchain", sections, ...extra });

  it("saves a report as an answer whose sections are answers, with a status that sums them up", () => {
    const saved = report([section("What is it?", "verified"), section("How are blocks linked?", "verified")]);
    assert.equal(saved.question, "Blockchain");
    assert.equal(saved.status, "verified");
    assert.deepEqual(saved.report!.plan, plan.sections);
    assert.equal(reportStatus([section("a", "verified"), section("b", "unverified")]), "unverified");
    assert.equal(reportStatus([section("a", "verified"), section("b", "no-answer")]), "verified", "a section without an answer does not make the others unverified");
    assert.equal(reportStatus([section("a", "no-answer")]), "no-answer");
    assert.equal(reportStatus([]), "no-answer");
  });

  it("sums up the sections' labels, the trusted one first, and says which were not written", () => {
    const label = (s: SavedAnswer) => (s.status === "verified" ? "Quotes found" : s.status === "no-answer" ? "No answer" : "Quotes found, answer not confirmed");
    const done = report([section("a", "unverified"), section("b", "verified"), section("c", "verified")]);
    assert.equal(describeReportLabels(done.report!, label), "2 of 3 sections: Quotes found. 1: Quotes found, answer not confirmed.");
    const stopped = report([section("a", "verified")], { stopped: true });
    assert.equal(describeReportLabels(stopped.report!, label), "1 of 3 sections: Quotes found. 2 stopped before they were written.");
    const closed = report([section("a", "no-answer")], { unfinished: true });
    assert.equal(describeReportLabels(closed.report!, label), "1 of 3 sections: No answer. 2 not written: the page was closed or reloaded.");
    assert.equal(describeReportLabels(report([], { stopped: true }).report!, label), "3 stopped before they were written.");
    // Labels with counts are counted by kind (the end-to-end run's report read "1 of 2 sections: 2 of 13 sentences…").
    const counted = report([{ ...section("a", "verified") }, { ...section("b", "verified") }]);
    const byCount = (s: SavedAnswer) => (s.question === "a" ? "2 of 13 sentences backed by a quote" : "0 of 11 sentences backed by a quote");
    assert.equal(describeReportLabels(counted.report!, byCount), "2 of 3 sections: Some sentences not backed by a quote. 1 not written.");
    assert.equal(labelKind("Some quotes not found (2 of 3 found)"), "Some quotes not found");
    assert.equal(labelKind("Quotes found"), "Quotes found");
  });

  it("is saved again after each section, in place", () => {
    const first = report([section("a", "verified")], { unfinished: true });
    const second = report([section("a", "verified"), section("b", "verified")], { unfinished: true });
    const other = { ...section("x", "verified"), id: "x" };
    assert.deepEqual(upsert(upsert([other], first), second).map((r) => [r.id, r.report?.sections.length]), [["x", undefined], ["r", 2]]);
  });

  it("goes into a backup and comes back whole", () => {
    const saved = report([section("What is it?", "verified")], { stopped: true });
    const back = parseBackup(JSON.stringify(makeBackup([], [saved], new Date("2026-10-31T12:00:00Z"))));
    assert.deepEqual(back.answers[0], saved);
    const broken = { ...saved, report: { ...saved.report!, sections: [{ question: 1 }] } };
    assert.throws(() => parseBackup(JSON.stringify(makeBackup([], [broken as unknown as SavedAnswer]))), /damaged/);
  });
});
