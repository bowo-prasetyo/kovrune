// The backup file's format, without dependencies, so the forwarding page on the old
// preview address (redirect/) writes the same backups as the app (backup.ts).

import type { SavedAnswer } from "./answers.ts";
import type { LibraryDocument } from "./library.ts";

export const BACKUP_FORMAT = "kovrune-backup";
/**
 * 2: documents may be Word, PowerPoint or OpenDocument text and presentation files.
 * 3: documents may be spreadsheets (Excel, OpenDocument).
 * A backup is written with the lowest version that knows all its documents' kinds, so versions from
 * before can restore it; a newer one makes them say to update the app instead of calling it damaged.
 */
export const BACKUP_VERSION = 3;

/** The document kinds each version knew. */
const VERSION_1_KINDS: ReadonlySet<string> = new Set(["text", "markdown", "html", "pdf"]);
const VERSION_2_KINDS: ReadonlySet<string> = new Set([...VERSION_1_KINDS, "docx", "pptx", "odt", "odp"]);

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** ISO time. */
  exportedAt: string;
  documents: LibraryDocument[];
  answers: SavedAnswer[];
}

export function makeBackup(documents: LibraryDocument[], answers: SavedAnswer[], now = new Date()): Backup {
  const version = documents.every((doc) => VERSION_1_KINDS.has(doc.kind)) ? 1 : documents.every((doc) => VERSION_2_KINDS.has(doc.kind)) ? 2 : BACKUP_VERSION;
  return { format: BACKUP_FORMAT, version, exportedAt: now.toISOString(), documents, answers };
}

export function backupFileName(now = new Date()): string {
  return `kovrune-backup-${now.toISOString().slice(0, 10)}.json`;
}
