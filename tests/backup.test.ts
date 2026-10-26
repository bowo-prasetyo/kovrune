import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResearchLibrary, runResearch } from "../src/agent/research.ts";
import { toSavedAnswer, type SavedAnswer } from "../src/app/research/answers.ts";
import { BACKUP_VERSION, backupFileName, describeMerge, makeBackup, mergeBackup, parseBackup } from "../src/app/research/backup.ts";
import type { LibraryDocument } from "../src/app/research/library.ts";
import { describeSaveError, isQuotaError } from "../src/app/research/store.ts";
import type { GenerationRequest, LanguageModel } from "../src/models/types.ts";

const doc = (id: string, text: string, extra: Partial<LibraryDocument> = {}): LibraryDocument => ({
  id,
  title: `${id}.pdf`,
  text,
  fileName: `${id}.pdf`,
  kind: "pdf",
  bytes: 1234,
  pages: 2,
  pageStarts: [0, 20],
  ...extra,
});

class ScriptedModel implements LanguageModel {
  readonly info = { id: "scripted", runtime: "scripted" as const, contextLength: 4096 };
  private readonly replies: string[];
  constructor(replies: string[]) {
    this.replies = replies;
  }
  supportsConstrainedDecoding() {
    return true;
  }
  async *generate(_request: GenerationRequest) {
    yield { text: this.replies.shift() ?? "{}", done: false };
    yield { text: "", done: true };
  }
  async dispose() {}
}

/** A real saved answer, made the way the app makes one. */
async function answer(): Promise<SavedAnswer> {
  const library = new ResearchLibrary([doc("report", "The project is licensed under the Mozilla Public License 2.0.")]);
  const result = await runResearch({
    question: "Which license?",
    library,
    model: new ScriptedModel([
      JSON.stringify({ tool: "search", args: { query: "license" } }),
      JSON.stringify({
        tool: "final_answer",
        args: { found: true, answer: "It uses MPL-2.0.", evidence: [{ docId: "report", quote: "licensed under the Mozilla Public License 2.0" }] },
      }),
    ]),
  });
  return toSavedAnswer({ question: "Which license?", result, steps: ["Searched", "Answered"], library, model: "Test model" });
}

describe("backup", () => {
  it("restores what it saved", async () => {
    const saved = await answer();
    const documents = [doc("report", "The project is licensed under the Mozilla Public License 2.0."), doc("notes", "Meeting on Tuesday.", { kind: "text", pages: undefined, pageStarts: undefined })];
    const text = JSON.stringify(makeBackup(documents, [saved], new Date("2026-10-26T12:00:00Z")));
    const backup = parseBackup(text);
    assert.equal(backup.exportedAt, "2026-10-26T12:00:00.000Z");
    assert.deepEqual(JSON.parse(JSON.stringify(backup.documents)), JSON.parse(JSON.stringify(documents)));
    assert.deepEqual(backup.answers, [JSON.parse(JSON.stringify(saved))]);
    assert.equal(backupFileName(new Date("2026-10-26T12:00:00Z")), "kovrune-backup-2026-10-26.json");
  });

  it("explains files it can't restore", async () => {
    assert.throws(() => parseBackup("not json"), /isn't valid JSON/);
    assert.throws(() => parseBackup(JSON.stringify({ documents: [] })), /not a Kovrune backup/);
    assert.throws(() => parseBackup(JSON.stringify({ ...makeBackup([], []), version: BACKUP_VERSION + 1 })), /newer version/);
    const damaged = { ...makeBackup([doc("a", "x")], []), documents: [{ id: "a", text: 5 }] };
    assert.throws(() => parseBackup(JSON.stringify(damaged)), /damaged/);
    const badAnswer = { ...makeBackup([], [await answer()]) };
    (badAnswer.answers[0] as unknown as Record<string, unknown>).evidence = "none";
    assert.throws(() => parseBackup(JSON.stringify(badAnswer)), /damaged/);
  });

  it("adds what is missing and never replaces anything", async () => {
    const saved = await answer();
    const here = { documents: [doc("report", "Version A."), doc("notes", "Notes.")], answers: [saved] };
    const backup = parseBackup(
      JSON.stringify(makeBackup([doc("report", "Version B."), doc("notes", "Notes."), doc("plan", "Plan.")], [saved, { ...saved, id: "other" }])),
    );
    const result = mergeBackup(here, backup);
    assert.deepEqual(
      result.documents.map((d) => [d.id, d.text]),
      [
        ["report-2", "Version B."],
        ["plan", "Plan."],
      ],
    );
    assert.deepEqual(
      result.answers.map((a) => a.id),
      ["other"],
    );
    assert.equal(result.skipped, 2);
    assert.equal(result.renamed, 1);
    assert.equal(
      describeMerge(result),
      "Added 2 documents and 1 answer; 2 were already here; 1 document with the same name as one here was added alongside it.",
    );
    assert.equal(describeMerge(mergeBackup(here, parseBackup(JSON.stringify(makeBackup(here.documents, here.answers))))), "Nothing new to add; 3 were already here.");
  });
});

describe("storage errors", () => {
  it("tells a full storage from other failures, and says what to do", () => {
    const full = new DOMException("The quota has been exceeded.", "QuotaExceededError");
    assert.equal(isQuotaError(full), true);
    assert.equal(isQuotaError(new Error("UnknownError: something else")), false);
    assert.match(describeSaveError(full, "a document", "it can still be used until you reload the page."), /no more storage.*Storage and backup/);
    assert.equal(
      describeSaveError(new Error("blocked"), "a document", "it can still be used until you reload the page."),
      "A document could not be saved in this browser (blocked); it can still be used until you reload the page.",
    );
  });
});
