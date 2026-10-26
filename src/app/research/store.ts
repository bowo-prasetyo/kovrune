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

class IndexedDbStore<T extends { id: string }> implements RecordStore<T> {
  readonly persistent = true;
  private readonly db: IDBDatabase;
  private readonly name: string;
  constructor(db: IDBDatabase, name: string) {
    this.db = db;
    this.name = name;
  }

  private store(mode: IDBTransactionMode) {
    return this.db.transaction(this.name, mode).objectStore(this.name);
  }

  async list() {
    const stored = await done(this.store("readonly").getAll() as IDBRequest<Array<Stored<T> & { addedAt?: number }>>);
    // Documents saved by database version 1 have "addedAt" instead of "savedAt".
    const time = (r: Stored<T> & { addedAt?: number }) => r.savedAt ?? r.addedAt ?? 0;
    return stored.sort((a, b) => time(a) - time(b)).map(({ savedAt: _s, addedAt: _a, ...record }) => record as unknown as T);
  }

  async put(record: T) {
    await done(this.store("readwrite").put({ ...record, savedAt: Date.now() }));
  }

  async remove(id: string) {
    await done(this.store("readwrite").delete(id));
  }
}

const memoryStores = (): Stores => ({ documents: new MemoryStore(), answers: new MemoryStore(), tasks: new MemoryStore() });

/**
 * Opens the database. Falls back to memory stores when IndexedDB is missing or refused
 * (private windows, blocked site data), so the library and answers still work for the visit.
 */
export async function openStores(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<Stores> {
  if (!factory) return memoryStores();
  try {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      for (const name of [DOCUMENTS, ANSWERS, TASKS]) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
      }
    };
    const db = await done(request);
    // Let a newer version of the app, opened in another tab, upgrade the database.
    db.onversionchange = () => db.close();
    return {
      documents: new IndexedDbStore(db, DOCUMENTS),
      answers: new IndexedDbStore(db, ANSWERS),
      tasks: new IndexedDbStore(db, TASKS),
    };
  } catch {
    return memoryStores();
  }
}

let shared: Promise<Stores> | undefined;

/** The page's stores, opened once. */
export function sharedStores(): Promise<Stores> {
  return (shared ??= openStores());
}

/**
 * The writes that bring the store from `saved` to `current`: records to put and IDs to
 * remove. Records are never edited in place, so one already saved under its ID is unchanged.
 */
export function storeChanges<T extends { id: string }>(
  saved: ReadonlyArray<{ id: string }>,
  current: T[],
): { put: T[]; remove: string[] } {
  const savedIds = new Set(saved.map((d) => d.id));
  const currentIds = new Set(current.map((d) => d.id));
  return {
    put: current.filter((d) => !savedIds.has(d.id)),
    remove: [...savedIds].filter((id) => !currentIds.has(id)),
  };
}

/** The size of the documents' saved text in UTF-8 bytes: an estimate of the storage they take. */
export function savedTextBytes(documents: ReadonlyArray<{ text: string }>): number {
  const encoder = new TextEncoder();
  return documents.reduce((sum, d) => sum + encoder.encode(d.text).length, 0);
}
