import { useMemo, useRef, useState } from "react";
import type { CallRecord } from "../../agent/agent.ts";
import type { DiffPart, QuoteContext } from "../../agent/evidence.ts";
import type { SentenceSupport } from "../../agent/support.ts";
import { ResearchLibrary, runResearch } from "../../agent/research.ts";
import { describeModelError, describeSetup, openModel } from "../models.ts";
import type { Settings } from "../settings.ts";
import {
  answerToBibtex,
  answerToMarkdown,
  exportFileName,
  formatTime,
  shownSupport,
  sourceTitle,
  toSavedAnswer,
  type SavedAnswer,
} from "./answers.ts";
import type { LibraryDocument } from "./library.ts";
import { loadSourcePrefs, openSourcesFor, saveSourcePrefs, WIKIPEDIA_LANGUAGES, type SourcePrefs } from "./sources.ts";
import { describePages, describeCall, describeStatus } from "./trace.ts";
import type { SavedRecords } from "./useSavedDocuments.ts";

type RunState =
  | { phase: "idle" }
  | { phase: "running"; steps: string[] }
  | { phase: "done"; steps: string[]; answer: SavedAnswer }
  | { phase: "stopped"; steps: string[] }
  | { phase: "error"; steps: string[]; message: string };

export function ResearchPanel({
  settings,
  documents,
  modelReady,
  history,
}: {
  settings: Settings;
  documents: LibraryDocument[];
  modelReady: boolean;
  /** Past answers, saved in the browser; each finished answer is added. */
  history: SavedRecords<SavedAnswer>;
}) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<RunState>({ phase: "idle" });
  const controller = useRef<AbortController>(undefined);
  const [prefs, setPrefs] = useState<SourcePrefs>(loadSourcePrefs);
  const usable = useMemo(() => documents.filter((d) => d.text.trim()), [documents]);
  const running = state.phase === "running";
  const anyOpenSource = prefs.wikipedia || prefs.openalex;
  const canAsk = modelReady && !running && (usable.length > 0 || anyOpenSource) && question.trim().length > 0;

  function updatePrefs(change: Partial<SourcePrefs>) {
    const next = { ...prefs, ...change };
    setPrefs(next);
    saveSourcePrefs(next);
  }

  async function ask() {
    const abort = new AbortController();
    controller.current = abort;
    const library = new ResearchLibrary(usable.map(({ id, title, text, pageStarts }) => ({ id, title, text, pageStarts })));
    const titleFor = (id: string) => library.documentFor(id)?.title;
    const steps: string[] = [];
    setState({ phase: "running", steps });
    try {
      const model = await openModel(settings);
      const result = await runResearch({
        question: question.trim(),
        library,
        model,
        sources: openSourcesFor(prefs),
        signal: abort.signal,
        onCall: (call: CallRecord) => {
          steps.push(describeCall(call, titleFor));
          setState({ phase: "running", steps: [...steps] });
        },
        // A search's step is shown as it starts, and gets its result count once it has run.
        onResult: (call: CallRecord, index: number) => {
          steps[index - 1] = describeCall(call, titleFor);
          setState({ phase: "running", steps: [...steps] });
        },
      });
      if (abort.signal.aborted) setState({ phase: "stopped", steps });
      else if (result.agent.stopReason === "error")
        setState({ phase: "error", steps, message: describeModelError(new Error(result.agent.error), settings) });
      else {
        const answer = toSavedAnswer({ question: question.trim(), result, steps, library, model: describeSetup(settings) });
        history.setRecords((answers) => [...answers, answer]);
        setState({ phase: "done", steps, answer });
      }
    } catch (error) {
      if (abort.signal.aborted) setState({ phase: "stopped", steps });
      else setState({ phase: "error", steps, message: describeModelError(error, settings) });
    }
  }

  return (
    <section>
      <h2>Ask a question</h2>
      {state.phase === "idle" && usable.length === 0 && (
        <div className="callout getting-started">
          <p>
            <strong>Getting started:</strong> add a PDF or text file above, then ask something it answers, for example
            "What does this report say about income in 2024?" or "How do I create a new project?".
          </p>
          <p>
            Questions about one document work best. With a small model, an answer takes a minute or two; you can watch
            each step below and stop at any time.
          </p>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canAsk) void ask();
        }}
      >
        <fieldset className="sources">
          <legend>Search in</legend>
          <label className="choice">
            <input type="checkbox" checked disabled />
            Your documents ({usable.length})
          </label>
          <label className="choice">
            <input type="checkbox" checked={prefs.wikipedia} disabled={running} onChange={(e) => updatePrefs({ wikipedia: e.target.checked })} />
            Wikipedia
          </label>
          {prefs.wikipedia && (
            <label className="inline">
              Language{" "}
              <select value={prefs.language} disabled={running} onChange={(e) => updatePrefs({ language: e.target.value })}>
                {(WIKIPEDIA_LANGUAGES.some(([code]) => code === prefs.language)
                  ? WIKIPEDIA_LANGUAGES
                  : [[prefs.language, prefs.language] as [string, string], ...WIKIPEDIA_LANGUAGES]
                ).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="choice">
            <input type="checkbox" checked={prefs.openalex} disabled={running} onChange={(e) => updatePrefs({ openalex: e.target.checked })} />
            OpenAlex (scholarly papers)
          </label>
          {anyOpenSource && (
            <p className="hint">
              The search words the model chooses, and the articles it opens, are requested from{" "}
              {[prefs.wikipedia && "Wikipedia", prefs.openalex && "OpenAlex"].filter(Boolean).join(" and ")}. Your documents and
              your question as typed stay on this computer.
            </p>
          )}
        </fieldset>
        <label>
          Question
          <textarea
            rows={3}
            value={question}
            disabled={running}
            placeholder="For example: What was the total income in 2024?"
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        {usable.length === 0 && !anyOpenSource && (
          <p className="hint">Add a document above, or tick Wikipedia or OpenAlex, to ask a question.</p>
        )}
        <div className="actions">
          {/* Distinct keys keep these as separate elements: if Stop were reused as the submit button, a run
              that ends during the Stop click would turn it back into Ask and submit the form again. */}
          {running ? (
            <button key="stop" type="button" onClick={() => controller.current?.abort()}>
              Stop
            </button>
          ) : (
            <button key="ask" type="submit" className="primary" disabled={!canAsk}>
              Ask
            </button>
          )}
        </div>
      </form>

      {state.phase !== "idle" && state.steps.length + (running ? 1 : 0) > 0 && (
        <ol className="trace" aria-live="polite" aria-label="Research steps">
          {state.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
          {running && <li className="progress">Waiting for the model…</li>}
        </ol>
      )}

      {state.phase === "stopped" && <p className="warning">Stopped.</p>}
      {state.phase === "error" && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      {state.phase === "done" && (
        <>
          <ResultView answer={state.answer} live />
          <div className="actions">
            <ExportButtons answer={state.answer} />
          </div>
        </>
      )}
      <PastAnswers history={history} shownId={state.phase === "done" ? state.answer.id : undefined} />
    </section>
  );
}

/** Saves text as a file through the browser's download, without any network request. */
function download(fileName: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function ExportButtons({ answer }: { answer: SavedAnswer }) {
  const bibtex = answerToBibtex(answer);
  return (
    <>
      <button onClick={() => download(exportFileName(answer, "md"), answerToMarkdown(answer), "text/markdown")}>
        Export as Markdown
      </button>
      {bibtex && (
        <button onClick={() => download(exportFileName(answer, "bib"), bibtex, "application/x-bibtex")}>
          Export papers as BibTeX
        </button>
      )}
    </>
  );
}

/** Earlier answers, newest first, each opened in place. The answer shown above is left out. */
function PastAnswers({ history, shownId }: { history: SavedRecords<SavedAnswer>; shownId?: string }) {
  const past = history.records.filter((a) => a.id !== shownId).reverse();
  if (!history.store) return null;
  return (
    <section className="past-answers">
      <h2>Past answers</h2>
      {history.saveError && (
        <p className="warning" role="alert">
          {history.saveError}
        </p>
      )}
      {past.length === 0 ? (
        <p className="hint">
          {history.store.persistent
            ? "Answers are saved in this browser when they finish, and listed here."
            : "This browser is not letting Kovrune save answers (for example in a private window), so they are listed only until you reload."}
        </p>
      ) : (
        <>
          <ul className="past">
            {past.map((answer) => (
              <li key={answer.id}>
                <details>
                  <summary>
                    <span className="past-question">{answer.question}</span>{" "}
                    <span className="hint">
                      {formatTime(answer.askedAt)}, {answer.model}
                    </span>
                  </summary>
                  <ResultView answer={answer} />
                  {answer.steps.length > 0 && (
                    <details className="past-steps">
                      <summary>Steps</summary>
                      <ol className="trace">
                        {answer.steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </details>
                  )}
                  <div className="actions">
                    <ExportButtons answer={answer} />
                    <button onClick={() => history.setRecords((answers) => answers.filter((a) => a.id !== answer.id))}>
                      Delete
                    </button>
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <p className="hint">
            Answers are saved in this browser only.{" "}
            <button
              className="link"
              onClick={() => {
                const shown = shownId ? " The answer shown above stays on screen until you ask again or reload." : "";
                if (confirm(`Delete all saved answers? Documents and models are kept.${shown}`)) history.setRecords(() => []);
              }}
            >
              Delete all saved answers
            </button>
          </p>
        </>
      )}
    </section>
  );
}

/** An answer with its label and evidence; `live` for the answer just given, so screen readers announce it. */
function ResultView({ answer, live = false }: { answer: SavedAnswer; live?: boolean }) {
  const sourceErrors = answer.sourceErrors.map((message) => (
    <p key={message} className="warning">
      {message} The answer is based on the other sources only.
    </p>
  ));
  if (answer.status === "no-answer") {
    return (
      <>
        {sourceErrors}
        <p className="warning" role={live ? "status" : undefined}>
          {answer.noAnswer}
        </p>
      </>
    );
  }
  const support = shownSupport(answer);
  const status = describeStatus(answer.status, answer.evidence, support);
  return (
    <div className={`result ${answer.status}`} role={live ? "status" : undefined}>
      {sourceErrors}
      <p>
        <span className={`status ${status.tone}`}>{status.label}</span> {status.detail}
      </p>
      {answer.answer && <Answer text={answer.answer} support={support} />}
      {answer.evidence.length > 0 && (
        <>
          <h3>Evidence</h3>
          <ul className="evidence">
            {answer.evidence.map((item, i) => (
              <li key={i} className={item.verified ? "verified" : "unverified"}>
                <span className="mark" aria-label={item.verified ? "Found in the document" : "Not in the document"}>
                  {item.verified ? "✓" : "✗"}
                </span>{" "}
                <SourceName docId={item.docId} answer={answer} />
                {item.context?.pages && <span className="hint">, {describePages(item.context.pages)}</span>}
                <blockquote>{item.quote}</blockquote>
                {item.context && <InContext context={item.context} />}
                {!item.verified && item.reason && <span className="reason">Problem: {item.reason}.</span>}
                {item.closest && <ClosestPassage parts={item.closest} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** The answer, with the sentences no found quote backs marked. */
function Answer({ text, support }: { text: string; support?: SentenceSupport }) {
  const unbacked = support?.sentences.some((s) => s.backed === false);
  if (!support || !unbacked) return <p className="answer">{text}</p>;
  return (
    <>
      <p className="answer">
        {support.sentences.map((sentence, i) =>
          sentence.backed === false ? (
            <mark key={i} className="unbacked" title="No found quote shares most of this sentence's words">
              <span aria-label="Not backed by a quote">⚠ </span>
              {sentence.text}
            </mark>
          ) : (
            <span key={i}>{sentence.text}</span>
          ),
        )}
      </p>
      <p className="hint">
        ⚠ marks sentences that share few words with any quote that was found. This is a word check, not a proof: a marked
        sentence can still be right, and an unmarked one can still be wrong.
      </p>
    </>
  );
}

/** A cited document's name; open-source documents link to where they came from, with the retrieval time. */
function SourceName({ docId, answer }: { docId: string; answer: SavedAnswer }) {
  const citation = answer.citations[docId];
  if (!citation) return <span className="source">{sourceTitle(answer, docId)}</span>;
  const retrieved = new Date(citation.retrievedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <span className="source">
      <a href={citation.url} target="_blank" rel="noreferrer">
        {citation.title}
      </a>{" "}
      <span className="hint">
        ({citation.source}, retrieved {retrieved})
      </span>
    </span>
  );
}

/** A verified quote where it is in the source, with the text around it. */
function InContext({ context }: { context: QuoteContext }) {
  return (
    <details className="context">
      <summary>Show in the source</summary>
      <blockquote>
        {context.more.before && "… "}
        {context.before}
        <mark>{context.passage}</mark>
        {context.after}
        {context.more.after && " …"}
      </blockquote>
    </details>
  );
}

/** The source passage nearest a failed quote, with the words the model changed marked. */
function ClosestPassage({ parts }: { parts: DiffPart[] }) {
  return (
    <div className="closest">
      <span className="hint">
        Closest passage in the source (<ins>added</ins> = in the source, <del>struck</del> = only in the quote):
      </span>
      <blockquote>
        {parts.map((part, i) => {
          const text = (i > 0 ? " " : "") + part.text;
          if (part.kind === "source-only") return <ins key={i}>{text}</ins>;
          if (part.kind === "quote-only") return <del key={i}>{text}</del>;
          return <span key={i}>{text}</span>;
        })}
      </blockquote>
    </div>
  );
}
