// The answers store survives the browser closing its database connection (harness 0.85.0): a report
// written for an hour kept only its first save, with no sections, after the writes began to fail.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { afterWrites, openStores } from "../src/app/research/store.ts";

/** Just enough of IndexedDB for the store: one database, its object stores kept across connections. */
function fakeIndexedDb() {
  const data = new Map<string, Map<string, unknown>>();
  const connections: Array<{ closed: boolean; onclose: (() => void) | null; close: () => void }> = [];
  let opens = 0;
  const later = (f: () => void) => setTimeout(f, 0);
  const request = <T>(run: () => T) => {
    const r = { result: undefined as T | undefined, error: null, onsuccess: null as null | (() => void), onerror: null };
    later(() => {
      r.result = run();
      r.onsuccess?.();
    });
    return r;
  };
  const factory = {
    open() {
      opens++;
      const db = {
        closed: false,
        onclose: null as (() => void) | null,
        onversionchange: null,
        objectStoreNames: { contains: (name: string) => data.has(name) },
        createObjectStore: (name: string) => data.set(name, new Map()),
        close() {
          db.closed = true;
        },
        transaction(name: string) {
          if (db.closed) throw new DOMException("The database connection is closing.", "InvalidStateError");
          let pending = 0;
          const tx = { oncomplete: null as null | (() => void), onerror: null, onabort: null, error: null, objectStore: () => store };
          const track = <T>(run: () => T) => {
            pending++;
            const r = request(() => {
              const value = run();
              later(() => --pending === 0 && tx.oncomplete?.());
              return value;
            });
            return r;
          };
          const records = data.get(name)!;
          const store = {
            get: (id: string) => track(() => records.get(id)),
            put: (value: { id: string }) => track(() => void records.set(value.id, structuredClone(value))),
            getAll: () => track(() => [...records.values()]),
            delete: (id: string) => track(() => void records.delete(id)),
          };
          return tx;
        },
      };
      connections.push(db);
      const open = { result: db, error: null, onsuccess: null as null | (() => void), onerror: null, onupgradeneeded: null as null | (() => void) };
      later(() => {
        open.onupgradeneeded?.();
        open.onsuccess?.();
      });
      return open;
    },
  };
  return { factory: factory as unknown as IDBFactory, connections, opens: () => opens };
}

const answer = (id: string, sections: number) => ({ id, question: "q", sections: Array.from({ length: sections }, (_, i) => `section ${i + 1}`) }) as never;

describe("the database connection closed by the browser", () => {
  it("is opened again, and the write that found it closed is made", async () => {
    const idb = fakeIndexedDb();
    const { answers } = await openStores(idb.factory);
    await answers.put(answer("report", 0));
    // Chrome closes a background tab's connection: the "close" event, then every transaction throws.
    const first = idb.connections[0]!;
    first.close();
    first.onclose?.();
    await answers.put(answer("report", 4));
    assert.equal(idb.opens(), 2);
    assert.deepEqual(((await answers.list()) as unknown as Array<{ sections: string[] }>)[0]!.sections.length, 4);
  });

  it("is opened again when it was closed without a close event, as a version change in another tab leaves it", async () => {
    const idb = fakeIndexedDb();
    const { answers } = await openStores(idb.factory);
    idb.connections[0]!.close();
    await answers.put(answer("a", 1));
    assert.equal((await answers.list()).length, 1);
    assert.equal(idb.opens(), 2);
  });
});

describe("what the page takes as saved after a failed write", () => {
  const r = (id: string, v: number) => ({ id, v });
  it("puts a record back as it was, so the next sync writes it again", () => {
    const before = [r("a", 1), r("b", 1)];
    const tried = r("a", 2);
    const added = r("c", 1);
    const now = [tried, r("b", 1), added];
    assert.deepEqual(afterWrites(now, before, [tried, added], []), [r("a", 1), r("b", 1)]);
  });

  it("keeps a removal that failed, and leaves a record changed since the failed write", () => {
    const before = [r("a", 1), r("b", 1)];
    const newer = r("a", 3);
    assert.deepEqual(afterWrites([newer], before, [r("a", 2)], ["b"]), [newer, r("b", 1)]);
  });
});
