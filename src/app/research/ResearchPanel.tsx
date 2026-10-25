import { useMemo, useRef, useState } from "react";
import type { CallRecord } from "../../agent/agent.ts";
import type { DiffPart } from "../../agent/evidence.ts";
import type { SentenceSupport } from "../../agent/support.ts";
import { ResearchLibrary, runResearch, type ResearchResult } from "../../agent/research.ts";
import { describeModelError, openModel } from "../models.ts";
import type { Settings } from "../settings.ts";
import type { LibraryDocument } from "./library.ts";
import { loadSourcePrefs, openSourcesFor, saveSourcePrefs, WIKIPEDIA_LANGUAGES, type SourcePrefs } from "./sources.ts";
import { describeCall, describeNoAnswer, describeStatus } from "./trace.ts";

type RunState =
  | { phase: "idle" }
  | { phase: "running"; steps: string[] }
  | { phase: "done"; steps: string[]; result: ResearchResult; library: ResearchLibrary }
  | { phase: "stopped"; steps: string[] }
  | { phase: "error"; steps: string[]; message: string };

export function ResearchPanel({
  settings,
  documents,
  modelReady,
}: {
  settings: Settings;
  documents: LibraryDocument[];
  modelReady: boolean;
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
    const library = new ResearchLibrary(usable.map(({ id, title, text }) => ({ id, title, text })));
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
      else setState({ phase: "done", steps, result, library });
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
      {state.phase === "done" && <ResultView result={state.result} library={state.library} />}
    </section>
  );
}

function ResultView({ result, library }: { result: ResearchResult; library: ResearchLibrary }) {
  const sourceErrors = result.sourceErrors.map((message) => (
    <p key={message} className="warning">
      {message} The answer is based on the other sources only.
    </p>
  ));
  if (result.status === "no-answer") {
    return (
      <>
        {sourceErrors}
        <p className="warning" role="status">
          {describeNoAnswer(result.agent.stopReason, result.agent.error)}
        </p>
      </>
    );
  }
  // Sentences are marked only when a quote checked out; otherwise the label already says nothing backs the answer.
  const support = result.status === "verified" ? result.support : undefined;
  const status = describeStatus(result.status, result.evidence, support);
  return (
    <div className={`result ${result.status}`} role="status">
      {sourceErrors}
      <p>
        <span className={`status ${status.tone}`}>{status.label}</span> {status.detail}
      </p>
      {result.final?.answer && <Answer text={result.final.answer} support={support} />}
      {result.evidence.length > 0 && (
        <>
          <h3>Evidence</h3>
          <ul className="evidence">
            {result.evidence.map((item, i) => (
              <li key={i} className={item.verified ? "verified" : "unverified"}>
                <span className="mark" aria-label={item.verified ? "Found in the document" : "Not in the document"}>
                  {item.verified ? "✓" : "✗"}
                </span>{" "}
                <SourceName docId={item.docId} result={result} library={library} />
                <blockquote>{item.quote}</blockquote>
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
function SourceName({ docId, result, library }: { docId: string; result: ResearchResult; library: ResearchLibrary }) {
  const citation = result.citations[docId];
  if (!citation) return <span className="source">{library.documentFor(docId)?.title ?? docId}</span>;
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
