import { APP_LOCALE } from "../locale.ts";
import { useState } from "react";
import { KIND_LABELS, pageUnit, readByEarlierVersion } from "../../documents/extract.ts";
import { ACCEPT, formatBytes, readDocument, type LibraryDocument } from "./library.ts";
import { describeWork, parseReferences, REFERENCE_EXTENSIONS, type DocumentWork, type ReferenceEntry } from "../../documents/references.ts";
import { workByDoi } from "../../sources/openalex.ts";
import { describeImport, filesFromDrop, pathOf, planImport, withExports, workFor } from "./import.ts";
import { loadSourcePrefs } from "./sources.ts";
import { savedTextBytes } from "./store.ts";
import type { SavedDocuments } from "./useSavedDocuments.ts";
import { reinsert } from "./undo.ts";
import { useUndo } from "./UndoNotice.tsx";
import { DamagedNotice } from "./DamagedNotice.tsx";


export function DocumentLibrary({ library }: { library: SavedDocuments }) {
  const { documents, setDocuments: onChange, store, saveError, damaged, deleteDamaged } = library;
  // Adding waits for the saved documents, so a new file cannot take a saved one's ID.
  const loading = !store;
  const [errors, setErrors] = useState<string[]>([]);
  const [reading, setReading] = useState<{ done: number; total: number; name?: string }>();
  const [summary, setSummary] = useState<string>();
  const [lookingUp, setLookingUp] = useState<{ done: number; total: number }>();
  const [preview, setPreview] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const removal = useUndo();

  /** Removes a document and its saved copy, with a way to bring it back. */
  function remove(doc: (typeof documents)[number]) {
    const index = documents.findIndex((d) => d.id === doc.id);
    onChange((docs) => docs.filter((d) => d.id !== doc.id));
    if (preview === doc.id) setPreview(undefined);
    removal.offer(`Removed ${doc.fileName}.`, () => onChange((docs) => reinsert(docs, doc, index)));
  }

  /**
   * Adds files, or the files of a folder: documents are read one at a time, a reference export among
   * them (.bib, .ris) gives them their paper details, files already here are skipped, and an export
   * added alone is matched against the documents already here (import.ts).
   */
  async function addFiles(files: File[]) {
    setErrors([]);
    setSummary(undefined);
    const plan = planImport(
      files.map((file) => ({ file, name: file.name, size: file.size, path: pathOf(file) })),
      documents,
    );
    const exports: Array<{ source: string; entries: ReferenceEntry[] }> = [];
    for (const { file } of plan.references) {
      try {
        const entries = parseReferences(file.name, await file.text());
        if (entries.length) exports.push({ source: file.name, entries });
        else setErrors((list) => [...list, `${file.name}: no references found in it.`]);
      } catch (error) {
        setErrors((list) => [...list, `${file.name}: ${error instanceof Error ? error.message : String(error)}`]);
      }
    }
    const before = new Set(documents.map((d) => d.id));
    const taken = new Set(before);
    let added = 0;
    let withDetails = 0;
    let failed = 0;
    setReading({ done: 0, total: plan.documents.length });
    for (const [i, { file }] of plan.documents.entries()) {
      setReading({ done: i, total: plan.documents.length, name: file.name });
      try {
        const read = await readDocument(file, taken);
        const work = workFor(read, exports);
        const doc: LibraryDocument = work ? { ...read, work } : read;
        taken.add(doc.id);
        added++;
        if (work) withDetails++;
        onChange((docs) => [...docs, doc]);
      } catch (error) {
        failed++;
        setErrors((list) => [...list, `${file.name}: ${error instanceof Error ? error.message : String(error)}`]);
      }
    }
    setReading(undefined);
    let matchedExisting = 0;
    if (exports.length && before.size) {
      // Only the documents that were here before: the new ones were matched as they were read.
      const existing = documents.filter((d) => before.has(d.id));
      matchedExisting = withExports(existing, exports).matched;
      onChange((docs) => {
        const { docs: updated } = withExports(docs.filter((d) => before.has(d.id)), exports);
        const byId = new Map(updated.map((d) => [d.id, d]));
        return docs.map((d) => byId.get(d.id) ?? d);
      });
    }
    const message = describeImport({
      added,
      withDetails,
      duplicates: plan.duplicates.length,
      unsupported: plan.unsupported.map((f) => f.name),
      failed,
      exports: exports.length,
      matchedExisting,
    });
    // One file added without a note to make keeps the page as quiet as before.
    if (message && !(added === 1 && !exports.length && !plan.duplicates.length && !plan.unsupported.length)) setSummary(message);
  }

  /** Documents that print a DOI but came with no reference export: their details can be looked up. */
  const doiOnly = documents.filter((d) => d.work?.from === "text" && d.work.doi);

  /** Looks up the paper details of each document that has only a DOI, sending only the DOI to OpenAlex. */
  async function lookUpDetails() {
    setErrors([]);
    const key = loadSourcePrefs().openalexKey;
    const list = doiOnly;
    let found = 0;
    for (const [i, doc] of list.entries()) {
      setLookingUp({ done: i, total: list.length });
      try {
        const result = await workByDoi(doc.work!.doi!, fetch, key);
        if (!result) continue;
        const work: DocumentWork = {
          ...(result.title ? { title: result.title } : {}),
          authors: result.info.authors,
          ...(result.info.year ? { year: result.info.year } : {}),
          doi: doc.work!.doi!,
          ...(result.info.venue ? { venue: result.info.venue } : {}),
          from: "openalex",
        };
        found++;
        onChange((docs) => docs.map((d) => (d.id === doc.id ? { ...d, work } : d)));
      } catch (error) {
        setErrors((errs) => [...errs, `${doc.fileName}: ${error instanceof Error ? error.message : String(error)}`]);
        break;
      }
    }
    setLookingUp(undefined);
    setSummary(`Found details for ${found} of ${list.length} document${list.length === 1 ? "" : "s"} on OpenAlex.`);
  }

  return (
    <section>
      <h2>Your documents</h2>
      <div
        className={dragging ? "dropzone dragging" : "dropzone"}
        onDragOver={(event) => {
          event.preventDefault();
          if (!loading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!loading) void filesFromDrop(event.dataTransfer).then(addFiles);
        }}
      >
        <p>Drop PDF, Word, PowerPoint, Excel, OpenDocument, CSV, text, Markdown or HTML files, or a folder of them, here, or</p>
        <label className="file-button">
          Choose files
          <input
            type="file"
            multiple
            accept={[ACCEPT, ...REFERENCE_EXTENSIONS].join(",")}
            disabled={loading}
            onChange={(event) => {
              void addFiles([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
        </label>{" "}
        <label className="file-button">
          Choose a folder
          <input
            type="file"
            multiple
            {...{ webkitdirectory: "" }}
            disabled={loading}
            onChange={(event) => {
              void addFiles([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
        </label>
        <p className="hint">
          Add a reference manager's export with your papers (a .bib or .ris file from Zotero, Mendeley, EndNote or JabRef, saved with
          its files), or later on its own, and each paper is cited with its title, authors, year, journal and DOI.
        </p>
      </div>
      <p className="hint">
        {loading
          ? "Loading your saved documents…"
          : store.persistent
            ? "Files are read on this device and never uploaded. Their text is saved in this browser, so they are still here after a reload; Remove deletes the saved copy."
            : "Files are read on this device and never uploaded. This browser is not letting Kovrune save them (for example in a private window), so they are kept only until you close or reload this page."}
      </p>
      {store?.persistent && documents.length > 0 && (
        <p className="hint">
          Saved: {documents.length} document{documents.length === 1 ? "" : "s"}, {formatBytes(savedTextBytes(documents))} of
          text. Removing documents does not remove downloaded models.
        </p>
      )}
      {saveError && (
        <p className="warning" role="alert">
          {saveError}
        </p>
      )}
      <DamagedNotice damaged={damaged} onDelete={deleteDamaged} noun="document" />

      {reading && reading.total > 0 && (
        <p className="progress" aria-live="polite">
          {reading.total === 1 ? "Reading 1 file…" : `Reading file ${reading.done + 1} of ${reading.total}${reading.name ? `: ${reading.name}` : ""}…`}
        </p>
      )}
      {summary && (
        <p className="hint" role="status">
          {summary}
        </p>
      )}
      {doiOnly.length > 0 && (
        <div className="lookup">
          <button onClick={() => void lookUpDetails()} disabled={Boolean(lookingUp)}>
            {lookingUp ? `Looking up ${lookingUp.done + 1} of ${lookingUp.total}…` : `Look up details on OpenAlex (${doiOnly.length})`}
          </button>{" "}
          <span className="hint">
            {doiOnly.length === 1 ? "A document prints its DOI" : `${doiOnly.length} documents print their DOI`} but came with no reference export. This sends only each
            DOI to OpenAlex.
          </span>
        </div>
      )}
      {errors.map((message) => (
        <p key={message} className="error" role="alert">
          {message}
        </p>
      ))}

      {documents.length > 0 && (
        <ul className="documents">
          {documents.map((doc) => (
            <li key={doc.id}>
              <div className="doc-row">
                <span className="doc-name">{doc.fileName}</span>
                <span className="doc-meta">
                  {KIND_LABELS[doc.kind]}
                  {doc.pages ? `, ${doc.pages} ${pageUnit(doc.kind)}${doc.pages === 1 ? "" : "s"}` : ""}, {formatBytes(doc.bytes)},{" "}
                  {doc.text.length.toLocaleString(APP_LOCALE)} characters
                </span>
                <span className="doc-actions">
                  <button
                    onClick={() => setPreview(preview === doc.id ? undefined : doc.id)}
                    aria-expanded={preview === doc.id}
                    aria-label={`${preview === doc.id ? "Hide" : "Show"} the text of ${doc.fileName}`}
                  >
                    {preview === doc.id ? "Hide text" : "Show text"}
                  </button>
                  <button aria-label={`Remove ${doc.fileName}`} onClick={() => remove(doc)}>
                    Remove
                  </button>
                </span>
              </div>
              {doc.work && <WorkLine work={doc.work} />}
              {doc.warning && <p className="warning">{doc.warning}</p>}
              {readByEarlierVersion(doc) && (
                <p className="warning">
                  Read by an earlier version of Kovrune, which lost which column of a table each value was in. Remove it and add the file again for better
                  answers about its tables.
                </p>
              )}
              {preview === doc.id && <pre className="doc-text">{doc.text || "(no text)"}</pre>}
            </li>
          ))}
        </ul>
      )}
      {removal.notice}
    </section>
  );
}

/** A document's paper details, under its name: who, when, title, venue, DOI, and where they came from. */
function WorkLine({ work }: { work: DocumentWork }) {
  const from = work.from === "export" ? `from ${work.source ?? "the reference export"}` : work.from === "openalex" ? "from OpenAlex" : "DOI found in the text";
  const head = describeWork(work);
  return (
    <p className="doc-work hint">
      {head && `${head}. `}
      {work.title && <cite>{work.title}</cite>}
      {work.title && ". "}
      {work.venue && `${work.venue}. `}
      {work.doi && (
        <a href={`https://doi.org/${work.doi}`} target="_blank" rel="noreferrer">
          doi:{work.doi}
        </a>
      )}{" "}
      ({from})
    </p>
  );
}
