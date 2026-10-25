import { useEffect, useRef, useState } from "react";
import type { LibraryDocument } from "./library.ts";
import { openDocumentStore, storeChanges, type DocumentStore } from "./store.ts";

export interface SavedDocuments {
  documents: LibraryDocument[];
  setDocuments: (update: (documents: LibraryDocument[]) => LibraryDocument[]) => void;
  /** Undefined while the saved documents load. */
  store?: DocumentStore;
  /** Set when a document could not be saved, e.g. because the browser's storage is full. */
  saveError?: string;
}

/**
 * The document library, loaded from the browser's storage and kept in sync with it: added
 * documents are saved and removed ones deleted. Documents are never edited, so the sync only
 * adds and removes.
 */
export function useSavedDocuments(): SavedDocuments {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [store, setStore] = useState<DocumentStore>();
  const [saveError, setSaveError] = useState<string>();
  // What the store holds, as far as this page knows.
  const saved = useRef<LibraryDocument[]>([]);

  useEffect(() => {
    let cancelled = false;
    void openDocumentStore().then(async (opened) => {
      const loaded = await opened.list().catch(() => []);
      if (cancelled) return;
      saved.current = loaded;
      setDocuments(loaded);
      setStore(opened);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!store) return;
    const { put, remove } = storeChanges(saved.current, documents);
    if (!put.length && !remove.length) return;
    saved.current = documents;
    // Ask the browser not to evict saved data under storage pressure, as for model downloads.
    if (put.length && store.persistent) void navigator.storage?.persist?.().catch(() => false);
    Promise.all([...put.map((doc) => store.put(doc)), ...remove.map((id) => store.remove(id))]).then(
      () => setSaveError(undefined),
      (error: unknown) =>
        setSaveError(
          `A document could not be saved in this browser (${error instanceof Error ? error.message : String(error)}). ` +
            "It can still be used until you reload the page.",
        ),
    );
  }, [store, documents]);

  return { documents, setDocuments, store, saveError };
}
