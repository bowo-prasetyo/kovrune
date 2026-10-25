import { useMemo, useRef, useState } from "react";
import type { CallRecord } from "../../agent/agent.ts";
import { ResearchLibrary, runResearch, type ResearchResult } from "../../agent/research.ts";
import { describeModelError, openModel } from "../models.ts";
import type { Settings } from "../settings.ts";
import type { LibraryDocument } from "./library.ts";
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
  const usable = useMemo(() => documents.filter((d) => d.text.trim()), [documents]);
  const running = state.phase === "running";
  const canAsk = modelReady && !running && usable.length > 0 && question.trim().length > 0;

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
        signal: abort.signal,
        onCall: (call: CallRecord) => {
          steps.push(describeCall(call, titleFor));
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canAsk) void ask();
        }}
      >
        <label>
          Question about your documents
          <textarea
            rows={3}
            value={question}
            disabled={running}
            placeholder="For example: What was the total income in 2024?"
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        {usable.length === 0 && <p className="hint">Add at least one document with text to ask a question.</p>}
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
  if (result.status === "no-answer") {
    return (
      <p className="warning" role="status">
        {describeNoAnswer(result.agent.stopReason, result.agent.error)}
      </p>
    );
  }
  const status = describeStatus(result.status, result.evidence.length);
  return (
    <div className={`result ${result.status}`} role="status">
      <p>
        <span className={`status ${result.status}`}>{status.label}</span> {status.detail}
      </p>
      {result.final?.answer && <p className="answer">{result.final.answer}</p>}
      {result.evidence.length > 0 && (
        <>
          <h3>Evidence</h3>
          <ul className="evidence">
            {result.evidence.map((item, i) => (
              <li key={i} className={item.verified ? "verified" : "unverified"}>
                <span className="mark" aria-label={item.verified ? "Found in the document" : "Not in the document"}>
                  {item.verified ? "✓" : "✗"}
                </span>{" "}
                <span className="source">{library.documentFor(item.docId)?.title ?? item.docId}</span>
                <blockquote>{item.quote}</blockquote>
                {!item.verified && item.reason && <span className="reason">Problem: {item.reason}.</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
