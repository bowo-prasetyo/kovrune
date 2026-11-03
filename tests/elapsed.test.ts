import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeElapsed, formatClock } from "../src/app/research/elapsed.ts";

describe("time shown while a question runs", () => {
  it("formats the time as a clock", () => {
    assert.deepEqual([formatClock(0), formatClock(42_400), formatClock(725_000), formatClock(3_725_000)], ["0:00", "0:42", "12:05", "1:02:05"]);
    assert.equal(formatClock(-5), "0:00");
  });

  it("says how long the model test says a question can take", () => {
    // UX audit: a question can take up to 7 min on a class 1 laptop with only "Waiting for the model…" on screen.
    const shown = describeElapsed(102_000, 6.5);
    assert.equal(shown.text, "1:42 so far. At the speed the model test measured, a question can take up to 7 min.");
    assert.equal(shown.over, false);
    assert.match(describeElapsed(5_000, 0.4).text, /can take under a minute/);
    assert.match(describeElapsed(60_000, 35, "report").text, /this report can take up to 35 min/);
  });

  it("says when a run takes longer than the test suggested, and that stopping is fine", () => {
    const shown = describeElapsed(8 * 60_000, 6.5);
    assert.equal(shown.over, true);
    assert.equal(shown.text, "8:00 so far, longer than the up to 7 min the model test suggested. The model may be busy or slower now; you can keep waiting, or stop.");
  });

  it("gives only the time when the model has not been tested", () => {
    assert.deepEqual(describeElapsed(3_000, undefined), { text: "0:03 so far.", over: false });
  });
});
