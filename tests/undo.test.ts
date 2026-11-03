import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { confirmModelDeletion } from "../src/app/models.ts";
import { reinsert } from "../src/app/research/undo.ts";

describe("undo after removing a document or deleting an answer", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };

  it("puts the record back where it was", () => {
    // UX audit: Remove and Delete acted at once, with no confirmation and no undo.
    assert.deepEqual(reinsert([a, c], b, 1), [a, b, c]);
    assert.deepEqual(reinsert([b, c], a, 0), [a, b, c]);
    assert.deepEqual(reinsert([a, b], c, 2), [a, b, c]);
  });

  it("keeps the record in range when others were removed since", () => {
    assert.deepEqual(reinsert([a], c, 5), [a, c]);
    assert.deepEqual(reinsert([], a, 3), [a]);
  });

  it("does nothing when the record is already back", () => {
    const records = [a, b];
    assert.equal(reinsert(records, b, 0), records);
  });

  it("asks before deleting a downloaded model, which undo can't bring back", () => {
    assert.equal(confirmModelDeletion("Qwen3.5-4B", "2.4 GB"), "Delete Qwen3.5-4B (2.4 GB) from this browser? To use it again, it has to be downloaded again.");
  });
});
