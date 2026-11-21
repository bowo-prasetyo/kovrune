import { useState } from "react";
import { findPassages, passagesCsv, parsePassageQuery, type Passage } from "../../documents/concordance.ts";
import { pageUnit } from "../../documents/extract.ts";
import { download } from "./download.ts";
import type { LibraryDocument } from "./library.ts";

/** At most this many passages are shown on the page; the CSV has all that were found (up to MAX_PASSAGES). */
const SHOWN = 100;

/**
 * Find every passage (harness 0.104.0): every paragraph of the user's documents with the words asked for, found without
 * the model, with each one's document, page and, in an interview transcript, speaker, and a CSV of them for coding
 * (documents/concordance.ts). A question to the model reads only a few passages; this lists all of them.
 */
export function PassageFinder({ documents }: { documents: LibraryDocument[] }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; passages: Passage[]; total: number }>();

  function find(event: React.FormEvent) {
    event.preventDefault();
    const docs = documents.map((d) => ({ id: d.id, name: d.fileName, text: d.text, ...(d.pageStarts ? { pageStarts: d.pageStarts } : {}) }));
    setResult({ query, ...findPassages(docs, query) });
  }

  const kinds = new Map(documents.map((d) => [d.id, d.kind]));
  const keys = result ? parsePassageQuery(result.query) : undefined;
  return (
    <details className="passage-finder">
      <summary>Find every passage</summary>
      <p className="hint">
        Lists every paragraph of your documents that has all the words you type, in any form ("rota" also finds "rotas"), or a "phrase in quotes" as written,
        with its page and, in an interview transcript, who is speaking. The model is not used, so nothing is missed and nothing is made up, and nothing leaves
        your device. Use it when you need every mention, for example to code interviews; ask a question when you need an answer.
      </p>
      <form onSubmit={find} className="passage-form">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Words, or a "phrase in quotes"' aria-label="Words to find" />
        <button type="submit" disabled={!query.trim() || !documents.length}>
          Find
        </button>
      </form>
      {result && (
        <div className="passages" aria-live="polite">
          <p>
            {result.total === 0
              ? `No passage has ${keys && keys.stems.length + keys.phrases.length > 1 ? "all of these words" : "this"}.`
              : `${result.total.toLocaleString()} passage${result.total === 1 ? "" : "s"} in ${new Set(result.passages.map((p) => p.docId)).size} document${new Set(result.passages.map((p) => p.docId)).size === 1 ? "" : "s"}${result.total > result.passages.length ? `; the first ${result.passages.length.toLocaleString()} are listed` : ""}.`}{" "}
            {result.passages.length > 0 && (
              <button type="button" onClick={() => download(`passages-${result.query.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "search"}.csv`, passagesCsv(result.passages), "text/csv;charset=utf-8")}>
                Download as CSV
              </button>
            )}
          </p>
          <ol>
            {result.passages.slice(0, SHOWN).map((p) => (
              <li key={`${p.docId}:${p.offset}`}>
                <span className="doc-meta">
                  {p.name}
                  {p.page !== undefined ? `, ${pageUnit(kinds.get(p.docId))} ${p.page}` : ""}
                  {p.speaker ? `, ${p.speaker}` : ""}
                </span>
                <blockquote>{p.text}</blockquote>
              </li>
            ))}
          </ol>
          {result.passages.length > SHOWN && <p className="hint">The other {(result.passages.length - SHOWN).toLocaleString()} are in the CSV.</p>}
        </div>
      )}
    </details>
  );
}
