// Saves the user's documents and past answers in the browser, so they are still there
// after a reload (issue #34), and the question in progress, so that it can resume (tasks.ts). For documents, only the extracted text and its metadata are
// stored, never the original file. The database is Kovrune's own: model downloads live in
// WebLLM's storage, so removing documents or answers never removes a model.

import type { SavedAnswer } from "./answers.ts";
import type { LibraryDocument } from "./library.ts";
import type { SavedTask } from "./tasks.ts";

/** Saved records of one kind, oldest first. */
export interface RecordStore<T extends { id: string }> {
  /** False when the browser does not let the page save data, e.g. in some private windows. */
  readonly persistent: boolean;
  list(): Promise<T[]>;
  put(record: T): Promise<void>;
  remove(id: string): Promise<void>;
}

export type DocumentStore = RecordStore<LibraryDocument>;
export type AnswerStore = RecordStore<SavedAnswer>;
export type TaskStore = RecordStore<SavedTask>;

export interface Stores {
  documents: DocumentStore;
  answers: AnswerStore;
  tasks: TaskStore;
}

/** Keeps records for this page only; used when the browser has no usable IndexedDB. */
export class MemoryStore<T extends { id: string }> implements RecordStore<T> {
  readonly persistent = false;
  private readonly records = new Map<string, T>();

  async list() {
    return [...this.records.values()];
  }
  async put(record: T) {
    this.records.delete(record.id);
    this.records.set(record.id, record);
  }
  async remove(id: string) {
    this.records.delete(id);
  }
}

const DB_NAME = "kovrune";
// Version 1 had documents only; version 2 added answers, and version 3 the question in progress.
// Each upgrade keeps what was saved.
const DB_VERSION = 3;
const DOCUMENTS = "documents";
const ANSWERS = "answers";
const TASKS = "tasks";

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** A stored record, with when it was saved so lists keep their order. */
type Stored<T> = T & { savedAt: number };

/**
 * Kovrune's database connection, opened again when the browser has closed it. Chrome can close a page's
 * connection while the page stays open (the tab in the background, storage under pressure; the "close"
 * event), and a newer version in another tab asks it to close ("versionchange"). Every write after that
 * failed with InvalidStateError until a reload: a report written for an hour kept only its first save,
 * with no sections, and said so only on the Past answers screen.
 */
export class Connection {
  private db?: IDBDatabase;
  private opening?: Promise<IDBDatabase>;
  private readonly factory: IDBFactory;
  constructor(factory: IDBFactory) {
    this.factory = factory;
  }

  /** The open database, opening it when there is none. */
  get(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    this.opening ??= openDatabase(this.factory).then(
      (db) => {
        // Let a newer version of the app, opened in another tab, upgrade the database; the next use reopens.
        db.onversionchange = () => this.drop(db);
        db.onclose = () => this.drop(db);
        this.db = db;
        this.opening = undefined;
        return db;
      },
      (error: unknown) => {
        this.opening = undefined;
        throw error;
      },
    );
    return this.opening;
  }

  /** Forgets a closed or closing connection, so the next use opens a new one. */
  drop(db?: IDBDatabase): void {
    if (db && db !== this.db) return;
    try {
      this.db?.close();
    } catch {
      // Already closed.
    }
    this.db = undefined;
  }
}

/** Errors after which the connection is opened again and the request tried once more. */
const RECONNECT = new Set(["InvalidStateError", "UnknownError", "TransactionInactiveError"]);

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    for (const name of [DOCUMENTS, ANSWERS, TASKS]) {
      if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
    }
  };
  return done(request);
}

class IndexedDbStore<T extends { id: string }> implements RecordStore<T> {
  readonly persistent = true;
  private readonly connection: Connection;
  private readonly name: string;
  constructor(connection: Connection, name: string) {
    this.connection = connection;
    this.name = name;
  }

  /**
   * Runs `request` on this store in a new transaction, and resolves when the transaction has committed.
   * When the connection was closed, it is opened again and the request run once more.
   */
  private async run<R>(mode: IDBTransactionMode, request: (store: IDBObjectStore, resolve: (value: R) => void) => void, retried = false): Promise<R> {
    try {
      const db = await this.connection.get();
      return await new Promise<R>((resolve, reject) => {
        const transaction = db.transaction(this.name, mode);
        let result: R;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new DOMException("The write was aborted.", "AbortError"));
        request(transaction.objectStore(this.name), (value) => (result = value));
      });
    } catch (error) {
      if (retried || !(error instanceof DOMException) || !RECONNECT.has(error.name)) throw error;
      this.connection.drop();
      return this.run(mode, request, true);
    }
  }

  async list() {
    const stored = await this.run<Array<Stored<T> & { addedAt?: number }>>("readonly", (store, resolve) => {
      const all = store.getAll();
      all.onsuccess = () => resolve(all.result as Array<Stored<T> & { addedAt?: number }>);
    });
    // Documents saved by database version 1 have "addedAt" instead of "savedAt".
    const time = (r: Stored<T> & { addedAt?: number }) => r.savedAt ?? r.addedAt ?? 0;
    return stored.sort((a, b) => time(a) - time(b)).map(({ savedAt: _s, addedAt: _a, ...record }) => record as unknown as T);
  }

  async put(record: T) {
    // A record saved again (a document given its paper details) keeps its place in the list.
    await this.run<void>("readwrite", (store) => {
      const get = store.get(record.id) as IDBRequest<(Stored<T> & { addedAt?: number }) | undefined>;
      get.onsuccess = () => {
        const savedAt = get.result?.savedAt ?? get.result?.addedAt ?? Date.now();
        store.put({ ...record, savedAt });
      };
    });
  }

  async remove(id: string) {
    await this.run<void>("readwrite", (store) => {
      store.delete(id);
    });
  }
}

const memoryStores = (): Stores => ({ documents: new MemoryStore(), answers: new MemoryStore(), tasks: new MemoryStore() });

/**
 * Opens the database. Falls back to memory stores when IndexedDB is missing or refused
 * (private windows, blocked site data), so the library and answers still work for the visit.
 */
export async function openStores(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<Stores> {
  if (!factory) return memoryStores();
  const connection = new Connection(factory);
  try {
    await connection.get();
  } catch {
    return memoryStores();
  }
  return {
    documents: new IndexedDbStore(connection, DOCUMENTS),
    answers: new IndexedDbStore(connection, ANSWERS),
    tasks: new IndexedDbStore(connection, TASKS),
  };
}

let shared: Promise<Stores> | undefined;

/** The page's stores, opened once. */
export function sharedStores(): Promise<Stores> {
  return (shared ??= openStores());
}

/**
 * The writes that bring the store from `saved` to `current`: records to put and IDs to remove.
 * Records are never edited in place; an edited record is a new object under the same ID, put again.
 */
export function storeChanges<T extends { id: string }>(
  saved: ReadonlyArray<{ id: string }>,
  current: T[],
): { put: T[]; remove: string[] } {
  const savedById = new Map(saved.map((d) => [d.id, d]));
  const currentIds = new Set(current.map((d) => d.id));
  return {
    // A record replaced by an edited copy (a document given its paper details) is saved again.
    put: current.filter((d) => savedById.get(d.id) !== d),
    remove: [...savedById.keys()].filter((id) => !currentIds.has(id)),
  };
}

/**
 * What the store holds after writes of which some failed: `saved` (what the page took as saved), except
 * that a record whose put failed, while still the one `saved` holds, is back as it was `before` (or absent),
 * and one whose removal failed is there again. So the next sync writes them again, instead of taking a
 * failed write for done. A record changed since the failed write is left, as the next sync puts it anyway.
 */
export function afterWrites<T extends { id: string }>(saved: T[], before: T[], failedPuts: T[], failedRemoves: string[]): T[] {
  const old = new Map(before.map((r) => [r.id, r]));
  const failed = new Set(failedPuts);
  const kept = saved.flatMap((r) => (failed.has(r) ? (old.has(r.id) ? [old.get(r.id)!] : []) : [r]));
  const ids = new Set(kept.map((r) => r.id));
  return [...kept, ...failedRemoves.flatMap((id) => (old.has(id) && !ids.has(id) ? [old.get(id)!] : []))];
}

/** The size of the documents' saved text in UTF-8 bytes: an estimate of the storage they take. */
export function savedTextBytes(documents: ReadonlyArray<{ text: string }>): number {
  const encoder = new TextEncoder();
  return documents.reduce((sum, d) => sum + encoder.encode(d.text).length, 0);
}

/** Whether an error means the browser's storage for the site is full. */
export function isQuotaError(error: unknown): boolean {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  return name === "QuotaExceededError" || /quota/i.test(error instanceof Error ? error.message : String(error));
}

/** Why something could not be saved, in words that say what to do about it. */
export function describeSaveError(error: unknown, what: string, consequence: string): string {
  if (isQuotaError(error)) {
    return `The browser has no more storage for this site, so ${what} could not be saved; ${consequence} Free space under Storage and backup, for example by deleting a model you don't use.`;
  }
  return `${what[0]!.toUpperCase()}${what.slice(1)} could not be saved in this browser (${error instanceof Error ? error.message : String(error)}); ${consequence}`;
}
