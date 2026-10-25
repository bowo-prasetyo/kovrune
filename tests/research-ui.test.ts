import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CallRecord } from "../src/agent/agent.ts";
import { documentId, formatBytes } from "../src/app/research/library.ts";
import { describeCall, describeNoAnswer, describeStatus } from "../src/app/research/trace.ts";
import { withoutPartLabels } from "../src/agent/research.ts";

const call = (fields: Partial<CallRecord>): CallRecord => ({
  valid: true,
  promptTokens: 0,
  completionTokens: 0,
  estimatedTokens: false,
  ttftMs: 0,
  totalMs: 0,
  ...fields,
});

describe("research screen helpers", () => {
  it("makes short, unique document IDs from file names", () => {
    const taken = new Set<string>();
    const first = documentId("Annual Report 2024 (final).pdf", taken);
    assert.equal(first, "annual-report-2024-final");
    taken.add(first);
    assert.equal(documentId("annual report 2024 final.txt", taken), "annual-report-2024-final-2");
    assert.equal(documentId("報告.pdf", taken), "document");
  });

  it("formats file sizes", () => {
    assert.deepEqual([formatBytes(900), formatBytes(20_480), formatBytes(3_250_000)], ["900 B", "20 KB", "3.1 MB"]);
  });

  it("describes each agent step in plain language", () => {
    const title = (id: string) => (id === "report#2" ? "Report" : undefined);
    assert.equal(describeCall(call({ tool: "search", args: { query: "income" } }), title), "Searching for “income”");
    assert.equal(describeCall(call({ tool: "read", args: { docId: "report#2" } }), title), "Reading Report");
    assert.equal(describeCall(call({ tool: "read", args: { docId: "x" } }), title), "Reading x");
    assert.match(describeCall(call({ tool: "final_answer", args: { found: false } }), title), /don't answer/);
    assert.match(describeCall(call({ valid: false }), title), /not a valid action/);
  });

  it("explains runs that end without an answer", () => {
    assert.match(describeNoAnswer("max-calls"), /all its steps/);
    assert.match(describeNoAnswer("error", "fetch failed"), /fetch failed/);
  });
});

describe("answer status and cleanup", () => {
  it("says only what the quote check proves", () => {
    assert.equal(describeStatus("verified", 1).label, "Quotes found");
    assert.match(describeStatus("verified", 1).detail, /Check that they support the whole answer/);
    assert.equal(describeStatus("unverified", 2).label, "Quotes not found");
    assert.equal(describeStatus("unverified", 0).label, "No quotes");
    assert.equal(describeStatus("not-found", 0).label, "Not found in your sources");
  });

  it("removes internal part labels from answers", () => {
    assert.equal(
      withoutPartLabels("As the tutorial (part 1 of 10) says, select the perspective."),
      "As the tutorial says, select the perspective.",
    );
    assert.equal(withoutPartLabels("Version 2 (part of the 3.x line)"), "Version 2 (part of the 3.x line)");
  });

  it("never ends a document ID with a hyphen after shortening", () => {
    assert.equal(documentId("PapyrusTutorial_OnActivityDiagrams_v0.2_d20110719.pdf", new Set()), "papyrustutorial-onactivitydiagrams-v0-2");
  });
});
