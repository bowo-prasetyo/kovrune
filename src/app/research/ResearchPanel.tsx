import { useEffect, useMemo, useRef, useState } from "react";
import type { CallRecord } from "../../agent/agent.ts";
import type { DiffPart, QuoteContext } from "../../agent/evidence.ts";
import type { SentenceSupport } from "../../agent/support.ts";
import { ReplayingModel, type RecordedCall } from "../../agent/replay.ts";
import { ResearchLibrary, runResearch } from "../../agent/research.ts";
import { planReport, type ReportPlan } from "../../agent/report.ts";
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
import { download } from "./download.ts";
import { describeProgress, resumability, TASK_ID, type SavedTask } from "./tasks.ts";
import { describePages, describeCall, describeStatus, REVIEW_STEP } from "./trace.ts";
import { usePendingTask } from "./usePendingTask.ts";
import { looksLikeReport, reportModeEnabled } from "./report.ts";
import { ReportPlanView } from "./ReportPlanView.tsx";
import type { SavedRecords } from "./useSavedDocuments.ts";

type RunState =
  | { phase: "idle" }
  | { phase: "running"; steps: string[]; restored?: number }
  | { phase: "done"; steps: string[]; answer: SavedAnswer; restored?: number }
  | { phase: "stopped"; steps: string[] }
  | { phase: "error"; steps: string[]; message: string };

export function ResearchPanel({
  settings,
  documents,
  modelReady,
  history,
  openAnswerId,
  onOpenAnswer,
}: {
  settings: Settings;
  documents: LibraryDocument[];
  modelReady: boolean;
  /** Past answers, saved in the browser; each finished answer is added. */
  history: SavedRecords<SavedAnswer>;
  /** The past answer the address opens (routes.ts). */
  openAnswerId?: string;
  /** Called when a past answer is opened, or closed (undefined). */
  onOpenAnswer: (id: string | undefined) => void;
}) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<RunState>({ phase: "idle" });
  // Report mode (docs/report-mode.md): shown with ?report until its sections can be researched.
  const reportMode = useMemo(() => reportModeEnabled(), []);
  const [mode, setMode] = useState<"question" | "report">("question");
  const [plan, setPlan] = useState<ReportPlan>();
  const [planning, setPlanning] = useState<string>();
  const controller = useRef<AbortController>(undefined);
  const [prefs, setPrefs] = useState<SourcePrefs>(loadSourcePrefs);
  const usable = useMemo(() => documents.filter((d) => d.text.trim()), [documents]);
  const running = state.phase === "running";
  const anyOpenSource = prefs.wikipedia || prefs.openalex;
  const canAsk = modelReady && !running && !planning && (usable.length > 0 || anyOpenSource) && question.trim().length > 0;
  // The question in progress, saved after every step so that it can continue after a reload or an error.
  const pending = usePendingTask();
  const setup = describeSetup(settings);
  const resume = pending.task && resumability(pending.task, { documentIds: usable.map((d) => d.id), setup });

  function updatePrefs(change: Partial<SourcePrefs>) {
    const next = { ...prefs, ...change };
    setPrefs(next);
    saveSourcePrefs(next);
  }

  /** Plans a report on the request in the box: one question per section, for the user to edit. */
  async function planTheReport() {
    const request = question.trim();
    setPlan(undefined);
    setPlanning(undefined);
    setState({ phase: "idle" });
    setPlanning("Planning the report…");
    try {
      const sources = [...(usable.length ? ["your documents"] : []), ...(prefs.wikipedia ? ["Wikipedia"] : []), ...(prefs.openalex ? ["OpenAlex"] : [])];
      setPlan(await planReport({ model: await openModel(settings), request, sources }));
      setPlanning(undefined);
    } catch (error) {
      setPlanning(describeModelError(error, settings));
    }
  }

  /** Asks the question in the box, or continues a saved task where it stopped. */
  async function ask(resumed?: SavedTask) {
    const abort = new AbortController();
    controller.current = abort;
    const now = new Date().toISOString();
    // A resumed task searches the same documents, in the same order, and the same sources.
    const documents = resumed ? resumed.documentIds.map((id) => usable.find((d) => d.id === id)!) : usable;
    const taskPrefs = resumed?.prefs ?? prefs;
    if (resumed) {
      setQuestion(resumed.question);
      setPrefs(resumed.prefs);
    }
    let task: SavedTask = resumed
      ? { ...resumed, error: undefined, updatedAt: now }
      : {
          id: TASK_ID,
          question: question.trim(),
          prefs: taskPrefs,
          documentIds: documents.map((d) => d.id),
          setup,
          calls: [],
          steps: [],
          startedAt: now,
          updatedAt: now,
        };
    pending.save(task);
    const library = new ResearchLibrary(documents.map(({ id, title, text, pageStarts }) => ({ id, title, text, pageStarts })));
    const titleFor = (id: string) => library.documentFor(id)?.title;
    const steps: string[] = [];
    let calls: RecordedCall[] = [];
    let model: ReplayingModel | undefined;
    const progress = () => {
      task = { ...task, calls, steps: [...steps], updatedAt: new Date().toISOString() };
      pending.save(task);
      setState({ phase: "running", steps: [...steps], restored: model?.replayed });
    };
    setState({ phase: "running", steps });
    try {
      model = new ReplayingModel(await openModel(settings), { replay: resumed?.calls, onRecord: (recorded) => (calls = recorded) });
      const result = await runResearch({
        question: task.question,
        library,
        model,
        sources: openSourcesFor(taskPrefs),
        signal: abort.signal,
        onCall: (call: CallRecord) => {
          steps.push(describeCall(call, titleFor));
          progress();
        },
        // A search's step is shown as it starts, and gets its result count once it has run.
        onResult: (call: CallRecord, index: number) => {
          steps[index - 1] = describeCall(call, titleFor);
          progress();
        },
        onReview: () => {
          steps.push(REVIEW_STEP);
          progress();
        },
      });
      if (abort.signal.aborted) {
        pending.clear();
        setState({ phase: "stopped", steps });
      } else if (result.agent.stopReason === "error") {
        const message = describeModelError(new Error(result.agent.error), settings);
        pending.save({ ...task, error: message });
        setState({ phase: "error", steps, message });
      } else {
        const answer = toSavedAnswer({ question: task.question, result, steps, library, model: setup, now: new Date(task.startedAt) });
        history.setRecords((answers) => [...answers, answer]);
        pending.clear();
        setState({ phase: "done", steps, answer, restored: model.replayed });
      }
    } catch (error) {
      if (abort.signal.aborted) {
        pending.clear();
        setState({ phase: "stopped", steps });
      } else {
        const message = describeModelError(error, settings);
        pending.save({ ...task, error: message });
        setState({ phase: "error", steps, message });
      }
    }
  }

  return (
    <section>
      <h2>Ask a question</h2>
      {state.phase === "idle" && pending.task && resume && (
        <div className="callout interrupted" role="status">
          <p>
            <strong>Interrupted question:</strong> "{pending.task.question}" stopped {describeProgress(pending.task)}
            {pending.task.error ? `: ${pending.task.error}` : ", when the page was closed or reloaded."}
          </p>
          {!resume.resumable && <p>It can't continue where it stopped, because {resume.reason}. You can ask it again.</p>}
          <div className="actions">
            {resume.resumable && (
              <button className="primary" disabled={!modelReady} onClick={() => void ask(pending.task)}>
                Continue
              </button>
            )}
            <button
              onClick={() => {
                setQuestion(pending.task!.question);
                pending.clear();
              }}
            >
              Ask again from the start
            </button>
            <button onClick={pending.clear}>Discard</button>
          </div>
        </div>
      )}
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
          if (canAsk) void (mode === "report" ? planTheReport() : ask());
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
        {reportMode && (
          <fieldset className="mode">
            <legend>Answer</legend>
            <label className="choice">
              <input type="radio" name="mode" checked={mode === "question"} disabled={running} onChange={() => setMode("question")} />
              Ask a question
            </label>
            <label className="choice">
              <input type="radio" name="mode" checked={mode === "report"} disabled={running} onChange={() => setMode("report")} />
              Write a report
            </label>
          </fieldset>
        )}
        <label>
          {mode === "report" ? "Report topic" : "Question"}
          <textarea
            rows={3}
            value={question}
            disabled={running}
            placeholder={mode === "report" ? "For example: blockchain technology, how it works and where it is used" : "For example: What was the total income in 2024?"}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        {reportMode && mode === "question" && looksLikeReport(question) && (
          <p className="hint">
            This asks for a report. A short answer can't hold one:{" "}
            <button type="button" className="link" onClick={() => setMode("report")}>
              Write a report
            </button>{" "}
            plans it as a few questions, each answered with checked quotes.
          </p>
        )}
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
              {mode === "report" ? "Plan the report" : "Ask"}
            </button>
          )}
        </div>
      </form>

      {planning && <p className={planning.endsWith("…") ? "progress" : "error"}>{planning}</p>}
      {plan && (
        <ReportPlanView
          plan={plan}
          maxTaskMinutes={settings.lastTest?.maxTaskMinutes}
          onChange={setPlan}
          onCancel={() => setPlan(undefined)}
        />
      )}
      {state.phase !== "idle" && state.steps.length + (running ? 1 : 0) > 0 && (
        <ol className="trace" aria-live="polite" aria-label="Research steps">
          {state.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
          {running && <li className="progress">Waiting for the model…</li>}
        </ol>
      )}

      {(state.phase === "running" || state.phase === "done") && !!state.restored && (
        <p className="hint">
          The first {state.restored === 1 ? "step was" : `${state.restored} steps were`} restored from where the question
          stopped.
        </p>
      )}
      {pending.saveError && running && <p className="hint">{pending.saveError}</p>}
      {state.phase === "stopped" && <p className="warning">Stopped.</p>}
      {state.phase === "error" && (
        <>
          <p className="error" role="alert">
            {state.message}
          </p>
          {pending.task && resume?.resumable && pending.task.calls.length > 0 && (
            <div className="actions">
              <button className="primary" disabled={!modelReady} onClick={() => void ask(pending.task)}>
                Continue from step {pending.task.calls.length + 1}
              </button>
            </div>
          )}
        </>
      )}
      {state.phase === "done" && (
        <>
          <ResultView answer={state.answer} live />
          <div className="actions">
            <ExportButtons answer={state.answer} />
          </div>
        </>
      )}
      <PastAnswers
        history={history}
        shownId={state.phase === "done" ? state.answer.id : undefined}
        openId={openAnswerId}
        onOpen={onOpenAnswer}
      />
    </section>
  );
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
function PastAnswers({
  history,
  shownId,
  openId,
  onOpen,
}: {
  history: SavedRecords<SavedAnswer>;
  shownId?: string;
  openId?: string;
  onOpen: (id: string | undefined) => void;
}) {
  const past = history.records.filter((a) => a.id !== shownId).reverse();
  // An answer opened by its address (a bookmark, Back or Forward) is brought into view.
  useEffect(() => {
    if (openId) document.getElementById(`answer-${openId}`)?.scrollIntoView({ block: "start" });
  }, [openId, history.store]);
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
              <li key={answer.id} id={`answer-${answer.id}`}>
                <details
                  open={answer.id === openId}
                  onToggle={(event) => {
                    const open = event.currentTarget.open;
                    if (open && answer.id !== openId) onOpen(answer.id);
                    else if (!open && answer.id === openId) onOpen(undefined);
                  }}
                >
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
        ⚠ marks sentences that share few words with the quotes that were found, or have a number, unit, month or "not" that the quotes don't back. This is a word check, not a proof: a marked
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
