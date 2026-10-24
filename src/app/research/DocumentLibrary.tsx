import { useState } from "react";
import { ACCEPT, formatBytes, readDocument, type LibraryDocument } from "./library.ts";

const KIND_LABELS = { pdf: "PDF", html: "HTML", markdown: "Markdown", text: "Text" } as const;

export function DocumentLibrary({
  documents,
  onChange,
}: {
  documents: LibraryDocument[];
  onChange: (update: (documents: LibraryDocument[]) => LibraryDocument[]) => void;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(0);
  const [preview, setPreview] = useState<string>();
  const [dragging, setDragging] = useState(false);

  async function addFiles(files: File[]) {
    setErrors([]);
    setReading((n) => n + files.length);
    const taken = new Set(documents.map((d) => d.id));
    for (const file of files) {
      try {
        const doc = await readDocument(file, taken);
        taken.add(doc.id);
        onChange((docs) => [...docs, doc]);
      } catch (error) {
        setErrors((list) => [...list, `${file.name}: ${error instanceof Error ? error.message : String(error)}`]);
      } finally {
        setReading((n) => n - 1);
      }
    }
  }

  return (
    <section>
      <h2>Your documents</h2>
      <div
        className={dragging ? "dropzone dragging" : "dropzone"}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void addFiles([...event.dataTransfer.files]);
        }}
      >
        <p>Drop PDF, text, Markdown or HTML files here, or</p>
        <label className="file-button">
          Choose files
          <input
            type="file"
            multiple
            accept={ACCEPT}
            onChange={(event) => {
              void addFiles([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="hint">
        Files are read on this device and never uploaded. They are kept only until you close or reload this page; saving
        them arrives in a later update.
      </p>

      {reading > 0 && (
        <p className="progress" aria-live="polite">
          Reading {reading} file{reading === 1 ? "" : "s"}…
        </p>
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
                  {doc.pages ? `, ${doc.pages} page${doc.pages === 1 ? "" : "s"}` : ""}, {formatBytes(doc.bytes)},{" "}
                  {doc.text.length.toLocaleString()} characters
                </span>
                <span className="doc-actions">
                  <button onClick={() => setPreview(preview === doc.id ? undefined : doc.id)} aria-expanded={preview === doc.id}>
                    {preview === doc.id ? "Hide text" : "Show text"}
                  </button>
                  <button onClick={() => onChange((docs) => docs.filter((d) => d.id !== doc.id))}>Remove</button>
                </span>
              </div>
              {doc.warning && <p className="warning">{doc.warning}</p>}
              {preview === doc.id && <pre className="doc-text">{doc.text || "(no text)"}</pre>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
