// Undo for removing a document or deleting an answer (UndoNotice.tsx). Removing deletes the saved copy
// at once (useSavedDocuments.ts); undo puts the record back where it was, and the sync saves it again.

/** The records with `record` back at `index`, or as they are if it is already there (undo pressed twice). */
export function reinsert<T extends { id: string }>(records: T[], record: T, index: number): T[] {
  if (records.some((r) => r.id === record.id)) return records;
  const at = Math.min(Math.max(index, 0), records.length);
  return [...records.slice(0, at), record, ...records.slice(at)];
}

/** How long an undo notice stays, unless the pointer or focus is on it. */
export const UNDO_SECONDS = 15;
