import { useEffect, useRef, useState } from "react";
import type { SavedAnswer } from "./answers.ts";
import type { LibraryDocument } from "./library.ts";
import { describeSaveError, sharedStores, storeChanges, type RecordStore, type Stores } from "./store.ts";

export interface SavedRecords<T extends { id: string }> {
  records: T[];
  setRecords: (update: (records: T[]) => T[]) => void;
  /** Undefined while the saved records load. */
  store?: RecordStore<T>;
  /** Set when a record could not be saved, e.g. because the browser's storage is full. */
  saveError?: string;
}

/**
 * Records loaded from the browser's storage and kept in sync with it: added records are saved
 * and removed ones deleted. Records are never edited, so the sync only adds and removes.
 */
function useSavedRecords<T extends { id: string }>(pick: (stores: Stores) => RecordStore<T>, noun: string): SavedRecords<T> {
  const [records, setRecords] = useState<T[]>([]);
  const [store, setStore] = useState<RecordStore<T>>();
  const [saveError, setSaveError] = useState<string>();
  // What the store holds, as far as this page knows.
  const saved = useRef<T[]>([]);

  useEffect(() => {
    let cancelled = false;
    void sharedStores().then(async (stores) => {
      const opened = pick(stores);
      const loaded = await opened.list().catch(() => []);
      if (cancelled) return;
      saved.current = loaded;
      // Keep anything added before loading finished; the sync below then saves it.
      const ids = new Set(loaded.map((r) => r.id));
      setRecords((current) => [...loaded, ...current.filter((r) => !ids.has(r.id))]);
      setStore(opened);
    });
    return () => {
      cancelled = true;
    };
    // Each caller passes a fixed selector, so the store is opened once.
  }, []);

  useEffect(() => {
    if (!store) return;
    const { put, remove } = storeChanges(saved.current, records);
    if (!put.length && !remove.length) return;
    saved.current = records;
    // Ask the browser not to evict saved data under storage pressure, as for model downloads.
    if (put.length && store.persistent) void navigator.storage?.persist?.().catch(() => false);
    Promise.all([...put.map((record) => store.put(record)), ...remove.map((id) => store.remove(id))]).then(
      () => setSaveError(undefined),
      (error: unknown) => setSaveError(describeSaveError(error, `a ${noun}`, "it can still be used until you reload the page.")),
    );
  }, [store, records, noun]);

  return { records, setRecords, store, saveError };
}

export interface SavedDocuments {
  documents: LibraryDocument[];
  setDocuments: (update: (documents: LibraryDocument[]) => LibraryDocument[]) => void;
  /** Undefined while the saved documents load. */
  store?: RecordStore<LibraryDocument>;
  saveError?: string;
}

/** The document library, saved in the browser. */
export function useSavedDocuments(): SavedDocuments {
  const { records, setRecords, store, saveError } = useSavedRecords((stores) => stores.documents, "document");
  return { documents: records, setDocuments: setRecords, store, saveError };
}

/** Past answers, saved in the browser, oldest first. */
export function useSavedAnswers(): SavedRecords<SavedAnswer> {
  return useSavedRecords((stores) => stores.answers, "answer");
}
