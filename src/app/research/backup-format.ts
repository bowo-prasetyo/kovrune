// The backup file's format, without dependencies, so the forwarding page on the old
// preview address (redirect/) writes the same backups as the app (backup.ts).

import type { SavedAnswer } from "./answers.ts";
import type { LibraryDocument } from "./library.ts";

export const BACKUP_FORMAT = "kovrune-backup";
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** ISO time. */
  exportedAt: string;
  documents: LibraryDocument[];
  answers: SavedAnswer[];
}

export function makeBackup(documents: LibraryDocument[], answers: SavedAnswer[], now = new Date()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), documents, answers };
}

export function backupFileName(now = new Date()): string {
  return `kovrune-backup-${now.toISOString().slice(0, 10)}.json`;
}
