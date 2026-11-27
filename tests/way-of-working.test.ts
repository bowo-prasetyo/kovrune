import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { harnessVersion, isModelFacing, measurementSection, problems } from "../scripts/way-of-working.ts";

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
});
