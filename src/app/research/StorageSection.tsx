import { useCallback, useState } from "react";
import {
  askToKeepData,
  deleteBrowserModel,
  downloadedBrowserModels,
  storageStatus,
  type DownloadedModel,
  type StorageStatus,
} from "../models.ts";
import type { Settings } from "../settings.ts";
import type { SavedAnswer } from "./answers.ts";
import { backupFileName, describeMerge, makeBackup, mergeBackup, parseBackup } from "./backup.ts";
import { download } from "./download.ts";
import { formatBytes } from "./library.ts";
import { savedTextBytes } from "./store.ts";
import type { SavedDocuments, SavedRecords } from "./useSavedDocuments.ts";

/** "2.4 GB" for large sizes, otherwise as the document list shows sizes. */
function size(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : formatBytes(bytes);
}

/** What the browser stores for Kovrune, how to free space, and a backup of documents and answers (M2 slice 3). */
export function StorageSection({
  settings,
  library,
  history,
}: {
  settings: Settings;
  library: SavedDocuments;
  history: SavedRecords<SavedAnswer>;
}) {
  const [status, setStatus] = useState<StorageStatus>();
  const [models, setModels] = useState<DownloadedModel[]>();
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [asked, setAsked] = useState(false);
  const inUse = settings.path === "browser" ? settings.modelId : undefined;
  // Restoring adds to the saved records, so it waits until they have loaded.
  const ready = !!library.store && !!history.store;

  const refresh = useCallback(() => {
    void storageStatus().then(setStatus);
    void downloadedBrowserModels().then(setModels, () => setModels([]));
  }, []);

  async function restore(file: File) {
    try {
      const backup = parseBackup(await file.text());
      const result = mergeBackup({ documents: library.documents, answers: history.records }, backup);
      if (result.documents.length) library.setDocuments((docs) => [...docs, ...result.documents]);
      if (result.answers.length) history.setRecords((answers) => [...answers, ...result.answers]);
      setMessage({ text: `${describeMerge(result)} The backup was made on ${backup.exportedAt.slice(0, 10)}.` });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), error: true });
    }
    refresh();
  }

  return (
    <details className="storage" onToggle={(event) => event.currentTarget.open && refresh()}>
      <summary>Storage and backup</summary>

      <p>
        {status?.usage !== undefined
          ? `Kovrune uses ${size(status.usage)} in this browser${status.quota ? `, of about ${size(status.quota)} the browser allows it` : ""}.`
          : "This browser doesn't say how much storage Kovrune uses."}
      </p>
      {status && (
        <p className={status.persisted ? "hint" : "warning"}>
          {status.persisted === true
            ? "Protected: the browser has agreed not to clear Kovrune's data when the disk runs low."
            : status.persisted === false
              ? "Not protected: when the disk runs low, the browser may clear Kovrune's data without asking, including downloaded models, saved documents and answers. Keep a backup of what you need."
              : "This browser doesn't say whether it may clear Kovrune's data when the disk runs low. Keep a backup of what you need."}
        </p>
      )}
      {status?.persisted === false && (
        <div className="actions">
          <button
            onClick={() =>
              void askToKeepData().then((granted) => {
                setAsked(!granted);
                refresh();
              })
            }
          >
            Ask the browser to keep it
          </button>
        </div>
      )}
      {asked && (
        <p className="hint">
          The browser declined. Chrome and Edge decide from how you use the site: bookmarking it, or using it often, can
          change their answer later.
        </p>
      )}

      <h3>Downloaded models</h3>
      {models === undefined ? (
        <p className="hint">Checking…</p>
      ) : models.length === 0 ? (
        <p className="hint">No models are stored in this browser.</p>
      ) : (
        <ul className="stored-models">
          {models.map((model) => (
            <li key={model.modelId}>
              <span>
                {model.label}, {size(model.bytes)}
                {model.modelId === inUse && " (in use)"}
              </span>
              <button
                disabled={model.modelId === inUse}
                title={model.modelId === inUse ? "To delete it, change the setup to another model first." : undefined}
                onClick={() => void deleteBrowserModel(model.modelId).finally(refresh)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Saved here as well: {library.documents.length} document{library.documents.length === 1 ? "" : "s"} (
        {formatBytes(savedTextBytes(library.documents))} of text) and {history.records.length} answer
        {history.records.length === 1 ? "" : "s"}. Remove them in their lists above.
      </p>

      <h3>Backup</h3>
      <p className="hint">
        A backup file holds the text of your documents and your saved answers, so you can restore them in another browser,
        or here if the browser clears its data. Models and the setup are not included. The file stays on your computer.
      </p>
      <div className="actions">
        <button
          disabled={!ready || (library.documents.length === 0 && history.records.length === 0)}
          onClick={() => download(backupFileName(), JSON.stringify(makeBackup(library.documents, history.records)), "application/json")}
        >
          Download a backup
        </button>
        <label className={ready ? "file-button" : "file-button disabled"}>
          Restore from a backup
          <input
            type="file"
            accept=".json,application/json"
            disabled={!ready}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void restore(file);
            }}
          />
        </label>
      </div>
      {message && (
        <p className={message.error ? "error" : "hint"} role={message.error ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </details>
  );
}
