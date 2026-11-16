import { useEffect, useRef, useState } from "react";
import type { SavedAnswer } from "./answers.ts";
import type { LibraryDocument } from "./library.ts";
import type { z } from "zod";
import { answerSchema, documentSchema, readable } from "./records.ts";
import { afterWrites, describeSaveError, sharedStores, storeChanges, type RecordStore, type Stores } from "./store.ts";

export interface SavedRecords<T extends { id: string }> {
  records: T[];
  setRecords: (update: (records: T[]) => T[]) => void;
  /** Undefined while the saved records load. */
  store?: RecordStore<T>;
  /** Set when a record could not be saved, e.g. because the browser's storage is full. */
  saveError?: string;
  /**
   * Saved records that can't be shown, because they don't hold what the screens read (records.ts).
   * They stay in the browser until deleted, and are left out of the list and of backups.
   */
  damaged: unknown[];
  /** Deletes the damaged records from the browser. */
  deleteDamaged: () => Promise<void>;
}

/**
 * Records loaded from the browser's storage and kept in sync with it: added records are saved
 * and removed ones deleted. Records are never edited, so the sync only adds and removes.
 */
/** How long after a failed write it is tried again, when nothing else is saved before then. */
export const RETRY_MS = 5000;
/** Retries by the timer after failed writes in a row; a change to the records still tries again after. */
export const MAX_RETRIES = 5;

function useSavedRecords<T extends { id: string }>(pick: (stores: Stores) => RecordStore<T>, noun: string, schema: z.ZodType): SavedRecords<T> {
  const [records, setRecords] = useState<T[]>([]);
  const [store, setStore] = useState<RecordStore<T>>();
  const [saveError, setSaveError] = useState<string>();
  const [damaged, setDamaged] = useState<unknown[]>([]);
  // What the store holds, as far as this page knows.
  const saved = useRef<T[]>([]);

  useEffect(() => {
    let cancelled = false;
    void sharedStores().then(async (stores) => {
      const opened = pick(stores);
      // A damaged record crashed the page on every reload; it is now set aside, not shown (records.ts).
      const { records: loaded, damaged } = readable<T>(await opened.list().catch(() => []), schema);
      if (cancelled) return;
      saved.current = loaded;
      setDamaged(damaged);
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

  // Bumped to sync again after a failed write, so it is retried even when nothing else changes.
  const [retry, setRetry] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Failed syncs in a row: a full disk fails every time, so the timer gives up after MAX_RETRIES.
  const failures = useRef(0);
  useEffect(() => () => clearTimeout(retryTimer.current), []);

  useEffect(() => {
    if (!store) return;
    const { put, remove } = storeChanges(saved.current, records);
    if (!put.length && !remove.length) return;
    const before = saved.current;
    saved.current = records;
    // Ask the browser not to evict saved data under storage pressure, as for model downloads.
    if (put.length && store.persistent) void navigator.storage?.persist?.().catch(() => false);
    void Promise.allSettled([...put.map((record) => store.put(record)), ...remove.map((id) => store.remove(id))]).then((results) => {
      const rejected = results.flatMap((r, i) => (r.status === "rejected" ? [{ i, error: r.reason as unknown }] : []));
      if (!rejected.length) {
        failures.current = 0;
        return setSaveError(undefined);
      }
      // A write that failed is not taken for done: the next sync, or the retry below, writes it again.
      const failedPuts = rejected.filter((f) => f.i < put.length).map((f) => put[f.i]!);
      const failedRemoves = rejected.filter((f) => f.i >= put.length).map((f) => remove[f.i - put.length]!);
      saved.current = afterWrites(saved.current, before, failedPuts, failedRemoves);
      setSaveError(describeSaveError(rejected[0]!.error, `a ${noun}`, "it can still be used until you reload the page, and saving it is tried again."));
      clearTimeout(retryTimer.current);
      if (++failures.current <= MAX_RETRIES) retryTimer.current = setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
    });
  }, [store, records, noun, retry]);

  const deleteDamaged = async () => {
    if (!store) return;
    // IndexedDB keys every record by its ID (store.ts), so even a damaged one has one.
    await Promise.all(damaged.map((record) => store.remove((record as { id: string }).id)));
    setDamaged([]);
  };

  return { records, setRecords, store, saveError, damaged, deleteDamaged };
}

export interface SavedDocuments {
  documents: LibraryDocument[];
  setDocuments: (update: (documents: LibraryDocument[]) => LibraryDocument[]) => void;
  /** Undefined while the saved documents load. */
  store?: RecordStore<LibraryDocument>;
  saveError?: string;
  damaged: unknown[];
  deleteDamaged: () => Promise<void>;
}

/** The document library, saved in the browser. */
export function useSavedDocuments(): SavedDocuments {
  const { records, setRecords, ...rest } = useSavedRecords((stores) => stores.documents, "document", documentSchema);
  return { documents: records, setDocuments: setRecords, ...rest };
}

/** Past answers, saved in the browser, oldest first. */
export function useSavedAnswers(): SavedRecords<SavedAnswer> {
  return useSavedRecords((stores) => stores.answers, "answer", answerSchema);
}
