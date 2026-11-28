import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { harnessVersion, isLabelRule, isModelFacing, measurementSection, pendingPhrase, problems } from "../scripts/way-of-working.ts";

const changelog = "| Version | Changes |\n| --- | --- |\n| 0.109.0 | Materials. |\n| 0.110.0 | Label tiers. |\n";
const measured = "## Summary\n\nX.\n\n## Measurement\n\nbench:replay on 454 tasks: 0 differ.\n";

describe("way of working (CONTRIBUTING.md)", () => {
  it("tells model-facing code from the rest", () => {
    for (const path of ["src/agent/support.ts", "src/documents/tables.ts", "src/tools/search.ts", "src/sources/arxiv.ts", "src/models/local-endpoint.ts", "eval/harness/scoring.ts", "eval/chem/tasks.ts", "eval/field/reports.ts"])
      assert.ok(isModelFacing(path), path);
    for (const path of ["src/app/research/AnswerView.tsx", "tests/support.test.ts", "docs/design.md", "eval/field/README.md", "eval/results/x.json", "eval/report.ts", ".github/workflows/ci.yml"])
      assert.ok(!isModelFacing(path), path);
  });

  it("reads the harness version and the measurement section", () => {
    assert.equal(harnessVersion('export const HARNESS_VERSION = "0.110.0";'), "0.110.0");
    assert.equal(measurementSection(measured), "bench:replay on 454 tasks: 0 differ.");
    assert.equal(measurementSection("## Measurement\n\n<!-- How was it measured? -->\n\n## Notes\n\nnone"), "", "the template's comment is not a measurement");
    assert.equal(measurementSection("No headings at all"), "");
  });

  it("asks nothing of a change to the app's screens or docs", () => {
    assert.deepEqual(problems({ files: ["src/app/research/AnswerView.tsx", "README.md"], baseVersion: "0.109.0", headVersion: "0.109.0", changelog, body: "" }), []);
  });

  it("asks a model-facing change for a version bump, a changelog row and a measurement", () => {
    const found = problems({ files: ["src/documents/tables.ts"], baseVersion: "0.109.0", headVersion: "0.109.0", changelog, body: "" });
    assert.equal(found.length, 2);
    assert.match(found[0]!, /bump HARNESS_VERSION.*still 0\.109\.0/);
    assert.match(found[1]!, /## Measurement/);
    assert.match(problems({ files: ["src/documents/tables.ts"], baseVersion: "0.109.0", headVersion: "0.111.0", changelog, body: measured })[0]!, /no changelog row for harness 0\.111\.0/);
  });

  it("passes a model-facing change that follows the way of working", () => {
    assert.deepEqual(problems({ files: ["src/documents/tables.ts"], baseVersion: "0.109.0", headVersion: "0.110.0", changelog, body: measured }), []);
    assert.deepEqual(
      problems({ files: ["src/documents/tables.ts", "eval/results/run.json"], baseVersion: "0.109.0", headVersion: "0.110.0", changelog, body: "" }),
      [],
      "a recorded run stands for the measurement",
    );
  });

  it("fails a measurement that is still to come", () => {
    // #219's own wording, which the check used to pass because there was text under the heading.
    const pending = "## Measurement\n- **Not yet measured:** `bench:replay --labels` and paired Qwen3.5-2B/4B open + held-out model runs.\n";
    const found = problems({ files: ["src/documents/tables.ts"], baseVersion: "0.109.0", headVersion: "0.110.0", changelog, body: pending });
    assert.equal(found.length, 1);
    assert.match(found[0]!, /still to come \("Not yet measured"\)/);
    for (const text of ["Measurement pending: model runs", "the 4B run is still pending", "pending measurement on 2B", "to be measured after merge", "TBD", "held-out comparison have not yet been run", "the runs haven't been recorded"])
      assert.ok(pendingPhrase(text), text);
    for (const text of ["bench:replay on 454 tasks: 0 differ.", "Not measured: libraries larger than 87 documents; this change doesn't touch them.", "A pending question resumes."])
      assert.equal(pendingPhrase(text), undefined, text);
  });

  it("fails a changelog row that says its measurement is pending", () => {
    const row = changelog + "| 0.111.0 | A contradiction check. **Measurement pending:** model runs have not yet been run. |\n";
    const found = problems({ files: ["src/documents/tables.ts"], baseVersion: "0.110.0", headVersion: "0.111.0", changelog: row, body: measured });
    assert.equal(found.length, 1);
    assert.match(found[0]!, /changelog row for harness 0\.111\.0 says the measurement is still to come/);
  });

  it("asks a change to the label rules for false reassurance", () => {
    assert.ok(isLabelRule("src/agent/support.ts") && isLabelRule("src/agent/trustworthiness.ts"));
    assert.ok(!isLabelRule("src/agent/report.ts") && !isLabelRule("src/documents/tables.ts"));
    const found = problems({ files: ["src/agent/support.ts"], baseVersion: "0.109.0", headVersion: "0.110.0", changelog, body: measured });
    assert.equal(found.length, 1);
    assert.match(found[0]!, /false reassurance before and after/);
    const withRate = measured + "\nbench:rescore over 88 reports: false reassurance 12 of 300 before, 12 of 300 after.\n";
    assert.deepEqual(problems({ files: ["src/agent/support.ts"], baseVersion: "0.109.0", headVersion: "0.110.0", changelog, body: withRate }), []);
  });
});
