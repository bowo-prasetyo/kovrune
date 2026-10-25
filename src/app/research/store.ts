// Saves the user's documents in the browser, so they are still there after a reload
// (issue #34). Only the extracted text and its metadata are stored, never the original
// file. The database is Kovrune's own: model downloads live in WebLLM's storage, so
// removing documents never removes a model.

import type { LibraryDocument } from "./library.ts";

export interface DocumentStore {
  /** False when the browser does not let the page save data, e.g. in some private windows. */
  readonly persistent: boolean;
  /** Saved documents, oldest first. */
  list(): Promise<LibraryDocument[]>;
  put(doc: LibraryDocument): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Keeps documents for this page only; used when the browser has no usable IndexedDB. */
export class MemoryDocumentStore implements DocumentStore {
  readonly persistent = false;
  private readonly docs = new Map<string, LibraryDocument>();

  async list() {
    return [...this.docs.values()];
  }
  async put(doc: LibraryDocument) {
    this.docs.delete(doc.id);
    this.docs.set(doc.id, doc);
  }
  async remove(id: string) {
    this.docs.delete(id);
  }
}

const DB_NAME = "kovrune";
const DB_VERSION = 1;
const DOCUMENTS = "documents";

/** A stored document, with when it was added so the library keeps its order. */
interface StoredDocument extends LibraryDocument {
  addedAt: number;
}

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

class IndexedDbDocumentStore implements DocumentStore {
  readonly persistent = true;
  private readonly db: IDBDatabase;
  constructor(db: IDBDatabase) {
    this.db = db;
  }

  private store(mode: IDBTransactionMode) {
    return this.db.transaction(DOCUMENTS, mode).objectStore(DOCUMENTS);
  }

  async list() {
    const stored = await done(this.store("readonly").getAll() as IDBRequest<StoredDocument[]>);
    return stored.sort((a, b) => a.addedAt - b.addedAt).map(({ addedAt: _addedAt, ...doc }) => doc);
  }

  async put(doc: LibraryDocument) {
    await done(this.store("readwrite").put({ ...doc, addedAt: Date.now() } satisfies StoredDocument));
  }

  async remove(id: string) {
    await done(this.store("readwrite").delete(id));
  }
}

/**
 * Opens the saved-documents database. Falls back to a memory store when IndexedDB is missing
 * or refused (private windows, blocked site data), so the library still works for the visit.
 */
export async function openDocumentStore(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<DocumentStore> {
  if (!factory) return new MemoryDocumentStore();
  try {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DOCUMENTS)) request.result.createObjectStore(DOCUMENTS, { keyPath: "id" });
    };
    return new IndexedDbDocumentStore(await done(request));
  } catch {
    return new MemoryDocumentStore();
  }
}

/**
 * The writes that bring the store from `saved` to `current`: documents to put and IDs to
 * remove. Documents are never edited in place, so one already saved under its ID is unchanged.
 */
export function storeChanges(
  saved: ReadonlyArray<{ id: string }>,
  current: LibraryDocument[],
): { put: LibraryDocument[]; remove: string[] } {
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
