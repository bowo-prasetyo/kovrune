// The backup file's format, without dependencies, so the forwarding page on the old
// preview address (redirect/) writes the same backups as the app (backup.ts).

import type { SavedAnswer } from "./answers.ts";
import type { LibraryDocument } from "./library.ts";

export const BACKUP_FORMAT = "kovrune-backup";
/**
 * 2: documents may be Word, PowerPoint or OpenDocument files (docs/office-formats.md). A backup
 * without any is still written as version 1, so versions from before can restore it; one with them
 * is version 2, so those versions say to update the app instead of calling the backup damaged.
 */
export const BACKUP_VERSION = 2;

/** The document kinds version 1 knew. */
const VERSION_1_KINDS: ReadonlySet<string> = new Set(["text", "markdown", "html", "pdf"]);

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** ISO time. */
  exportedAt: string;
  documents: LibraryDocument[];
  answers: SavedAnswer[];
}

export function makeBackup(documents: LibraryDocument[], answers: SavedAnswer[], now = new Date()): Backup {
  const version = documents.every((doc) => VERSION_1_KINDS.has(doc.kind)) ? 1 : BACKUP_VERSION;
  return { format: BACKUP_FORMAT, version, exportedAt: now.toISOString(), documents, answers };
}

export function backupFileName(now = new Date()): string {
  return `kovrune-backup-${now.toISOString().slice(0, 10)}.json`;
}
