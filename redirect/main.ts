// The old GitHub Pages preview (bowo-prasetyo.github.io/kovrune/) forwards to the app's
// new address. Browser storage belongs to each site, so documents and answers saved here
// don't follow; when there are some, this page offers a backup for the new address to
// restore (Storage and backup) instead of forwarding at once.

import "./style.css";
import { APP_URL } from "../src/app/build-info.ts";
import { backupFileName, makeBackup } from "../src/app/research/backup-format.ts";
import type { SavedAnswer } from "../src/app/research/answers.ts";
import type { LibraryDocument } from "../src/app/research/library.ts";

const DB_NAME = "kovrune";

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** Opens the app's database if it exists, without creating it. */
async function openExisting(): Promise<IDBDatabase | undefined> {
  if (indexedDB.databases && !(await indexedDB.databases()).some((db) => db.name === DB_NAME)) return undefined;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    let created = false;
    // Only a database that doesn't exist yet gets an upgrade here; don't leave an empty one behind.
    request.onupgradeneeded = () => {
      created = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => (created ? resolve(undefined) : reject(request.error));
  });
}

/** Records of one store, oldest first, as the app's store.ts lists them. */
async function records<T>(db: IDBDatabase, name: string): Promise<T[]> {
  if (!db.objectStoreNames.contains(name)) return [];
  type Stored = T & { savedAt?: number; addedAt?: number };
  const stored = await done(db.transaction(name, "readonly").objectStore(name).getAll() as IDBRequest<Stored[]>);
  const time = (r: Stored) => r.savedAt ?? r.addedAt ?? 0;
  return stored.sort((a, b) => time(a) - time(b)).map(({ savedAt: _s, addedAt: _a, ...record }) => record as unknown as T);
}

function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

async function main() {
  let documents: LibraryDocument[] = [];
  let answers: SavedAnswer[] = [];
  try {
    const db = await openExisting();
    if (db) {
      documents = await records<LibraryDocument>(db, "documents");
      answers = await records<SavedAnswer>(db, "answers");
      db.close();
    }
  } catch {
    // Storage blocked or unreadable: nothing to offer, so just forward.
  }
  if (documents.length === 0 && answers.length === 0) {
    location.replace(APP_URL);
    return;
  }
  document.getElementById("status")!.textContent = "Kovrune is now at kovrune.pages.dev.";
  document.getElementById("counts")!.textContent =
    `You have ${count(documents.length, "document")} and ${count(answers.length, "saved answer")} in this browser at the old address.`;
  document.getElementById("saved")!.hidden = false;
  document.getElementById("backup")!.addEventListener("click", () => {
    download(backupFileName(), JSON.stringify(makeBackup(documents, answers)));
  });
}

void main();
