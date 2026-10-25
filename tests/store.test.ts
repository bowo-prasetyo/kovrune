import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LibraryDocument } from "../src/app/research/library.ts";
import { MemoryDocumentStore, openDocumentStore, savedTextBytes, storeChanges } from "../src/app/research/store.ts";

const doc = (id: string, text = "Some text."): LibraryDocument => ({
  id,
  title: `${id}.txt`,
  text,
  fileName: `${id}.txt`,
  kind: "text",
  bytes: text.length,
});

describe("saved documents", () => {
  it("saves added documents and deletes removed ones", () => {
    const a = doc("a");
    const b = doc("b");
    const c = doc("c");
    assert.deepEqual(storeChanges([], [a, b]), { put: [a, b], remove: [] });
    assert.deepEqual(storeChanges([a, b], [a, b]), { put: [], remove: [] });
    assert.deepEqual(storeChanges([a, b], [b, c]), { put: [c], remove: ["a"] });
    assert.deepEqual(storeChanges([a], []), { put: [], remove: ["a"] });
  });

  it("estimates the saved text's size", () => {
    assert.equal(savedTextBytes([doc("a", "abc"), doc("b", "é")]), 5);
  });

  it("keeps documents in memory, in the order they were added", async () => {
    const store = new MemoryDocumentStore();
    assert.equal(store.persistent, false);
    await store.put(doc("a"));
    await store.put(doc("b"));
    await store.remove("a");
    await store.put(doc("c"));
    assert.deepEqual(
      (await store.list()).map((d) => d.id),
      ["b", "c"],
    );
  });

  it("falls back to memory when the browser has no usable IndexedDB", async () => {
    // No IndexedDB at all, as in Node.
    assert.equal((await openDocumentStore(undefined)).persistent, false);
    // open() throws, as some browsers do with storage blocked.
    const throwing = { open: () => { throw new DOMException("blocked", "SecurityError"); } } as unknown as IDBFactory;
    assert.equal((await openDocumentStore(throwing)).persistent, false);
    // open() fails asynchronously, as in a private window that refuses storage.
    const failing = {
      open: () => {
        const request = { error: new DOMException("refused", "InvalidStateError") } as unknown as IDBOpenDBRequest;
        setTimeout(() => request.onerror?.(new Event("error")));
        return request;
      },
    } as unknown as IDBFactory;
    const store = await openDocumentStore(failing);
    assert.equal(store.persistent, false);
    await store.put(doc("a"));
    assert.equal((await store.list()).length, 1, "the fallback still works for the visit");
  });
});
