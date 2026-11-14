import { useEffect, useMemo, useRef, useState } from "react";
import type { CallRecord } from "../../agent/agent.ts";
import { ReplayingModel, type RecordedCall } from "../../agent/replay.ts";
import { ResearchLibrary, runResearch } from "../../agent/research.ts";
import { planReport, plansFromSources, type ReportPlan } from "../../agent/report.ts";
import { answeredSections, MIN_SYNTHESIS_SECTIONS, writeSynthesis, writesSynthesis, type Synthesis } from "../../agent/synthesis.ts";
import { joinNames } from "../../tools/research.ts";
import type { Navigate } from "../links.ts";
import { describeModelError, describeSetup, openModel } from "../models.ts";
import { answerTimeTip, type Settings } from "../settings.ts";
import { toSavedAnswer, type SavedAnswer } from "./answers.ts";
import { RecentAnswers } from "./AnswersScreen.tsx";
import { ExportButtons, ResultView } from "./AnswerView.tsx";
import { describeElapsed } from "./elapsed.ts";
import type { LibraryDocument } from "./library.ts";
import { describeEstimate, looksLikeReport, reportMinutes, toSavedReport, upsert } from "./report.ts";
import { ReportPlanView } from "./ReportPlanView.tsx";
import { isSubmitShortcut, shortcutKeys } from "./shortcut.ts";
import {
  anyOpenSource as anyOpenSourceTicked,
  loadSourcePrefs,
  openSourceNames,
  openSourcesFor,
  saveSourcePrefs,
  validFromYear,
  WIKIPEDIA_LANGUAGES,
  type SourcePrefs,
} from "./sources.ts";
import { OPENALEX_FIELDS } from "../../sources/openalex.ts";
import { describeProgress, resumability, TASK_ID, type SavedTask } from "./tasks.ts";
import { describeCall, REVIEW_STEP } from "./trace.ts";
import { usePendingTask } from "./usePendingTask.ts";
import type { SavedRecords } from "./useSavedDocuments.ts";

/** A report's section heading in the trace (writeReport), shown apart from the steps under it. */
const SYNTHESIS_STEP = "Introduction and conclusion: writing them from the sections";
const REPORT_SECTION_STEP = /^Section \d+ of \d+: |^Introduction and conclusion: /;

type RunState =
  | { phase: "idle" }
  | { phase: "running"; steps: string[]; restored?: number; reportId?: string }
  | { phase: "done"; steps: string[]; answer: SavedAnswer; restored?: number }
  | { phase: "stopped"; steps: string[] }
  | { phase: "error"; steps: string[]; message: string };

export function ResearchPanel({
  settings,
  documents,
  modelReady,
  history,
  navigate,
}: {
  settings: Settings;
  documents: LibraryDocument[];
  modelReady: boolean;
  /** Past answers, saved in the browser; each finished answer is added. */
  history: SavedRecords<SavedAnswer>;
  /** Opens another screen: a past answer, or the Past answers page. */
  navigate: Navigate;
}) {
  const [question, setQuestion] = useState("");
  const keys = useMemo(() => shortcutKeys(navigator.platform || navigator.userAgent), []);
  const [state, setState] = useState<RunState>({ phase: "idle" });
  // Report mode (docs/report-mode.md): a report is planned as questions, one per section, each answered as a question is.
  const [mode, setMode] = useState<"question" | "report">("question");
  const [plan, setPlan] = useState<ReportPlan>();
  // Whether the report gets an introduction and conclusion (slice 5): the model's default, then the user's choice.
  const [synthesis, setSynthesis] = useState(false);
  const [planning, setPlanning] = useState<string>();
  const controller = useRef<AbortController>(undefined);
  // When the run started, and how long the model test says it can take, for the time shown under its steps.
  const [run, setRun] = useState<{ startedAt: number; upToMinutes?: number; what: "question" | "report" }>();
  // The answer, report or error a run ends with: brought into view and focused when it appears, since on a
  // laptop screen it appeared below the fold with nothing to say it had.
  const outcome = useRef<HTMLDivElement>(null);
  const shownPhase = useRef(state.phase);
  useEffect(() => {
    const before = shownPhase.current;
    shownPhase.current = state.phase;
    if (before !== "running" || (state.phase !== "done" && state.phase !== "error")) return;
    const element = outcome.current;
    if (!element) return;
    element.focus({ preventScroll: true });
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [state.phase]);
  const [prefs, setPrefs] = useState<SourcePrefs>(loadSourcePrefs);
  const usable = useMemo(() => documents.filter((d) => d.text.trim()), [documents]);
  const running = state.phase === "running";
  const anyOpenSource = anyOpenSourceTicked(prefs);
  const downloads = [...(prefs.arxiv ? ["arxiv.org"] : []), ...(prefs.datacite ? ["zenodo.org"] : [])];
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
      const sources = [...(usable.length ? ["your documents"] : []), ...openSourceNames(prefs)];
      // For models it is on for (plansFromSources), the planner is shown what the documents say about
      // the request, so that it plans sections the documents can answer.
      const model = await openModel(settings);
      const library =
        usable.length && plansFromSources(model.info.id)
          ? new ResearchLibrary(usable.map(({ id, title, text, pageStarts }) => ({ id, title, text, pageStarts })))
          : undefined;
      setSynthesis(writesSynthesis(model.info.id));
      setPlan(await planReport({ model, request, sources, library }));
      setPlanning(undefined);
    } catch (error) {
      setPlanning(describeModelError(error, settings));
    }
  }

  /**
   * Writes a planned report (docs/report-mode.md, slice 2): each section's question is researched in
   * turn, as a question is, and the report is saved after every section, so Stop or a reload keeps the
   * sections already written. A section that ends without an answer says so and the next one starts;
   * a model or server error stops the report there.
   */
  async function writeReport(edited: ReportPlan, withSynthesis: boolean) {
    const reportPlan = { ...edited, title: edited.title.trim(), sections: edited.sections.map((q) => q.trim()) };
    const estimate = describeEstimate(reportPlan.sections.length, settings.lastTest?.maxTaskMinutes);
    if (estimate.confirm && !confirm(`This report has ${estimate.text}. Write it?`)) return;
    const abort = new AbortController();
    controller.current = abort;
    const request = question.trim();
    const askedAt = new Date().toISOString();
    const id = `${Date.parse(askedAt).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const library = new ResearchLibrary(usable.map(({ id, title, text, pageStarts }) => ({ id, title, text, pageStarts })));
    const titleFor = (docId: string) => library.documentFor(docId)?.title;
    const sources = openSourcesFor(prefs);
    const sections: SavedAnswer[] = [];
    let written: Synthesis | undefined;
    const save = (extra: { unfinished?: boolean; stopped?: boolean }) => {
      const record = toSavedReport({ id, askedAt, model: setup, plan: reportPlan, request, sections: [...sections], synthesis: written, ...extra });
      history.setRecords((answers) => upsert(answers, record));
      return record;
    };
    const steps: string[] = [];
    setPlan(undefined);
    setRun({
      startedAt: Date.now(),
      upToMinutes: reportMinutes(reportPlan.sections.length + (withSynthesis ? 1 : 0), settings.lastTest?.maxTaskMinutes),
      what: "report",
    });
    setState({ phase: "running", steps, reportId: id });
    save({ unfinished: true });
    try {
      const model = await openModel(settings);
      for (const [i, sectionQuestion] of reportPlan.sections.entries()) {
        if (abort.signal.aborted) break;
        steps.push(`Section ${i + 1} of ${reportPlan.sections.length}: ${sectionQuestion}`);
        const sectionSteps: string[] = [];
        const shown = () => setState({ phase: "running", steps: [...steps], reportId: id });
        shown();
        const step = (text: string, index?: number) => {
          if (index === undefined) {
            sectionSteps.push(text);
            steps.push(text);
          } else {
            sectionSteps[index] = text;
            steps[steps.length - sectionSteps.length + index] = text;
          }
          shown();
        };
        const result = await runResearch({
          question: sectionQuestion,
          library,
          model,
          sources,
          signal: abort.signal,
          onCall: (call: CallRecord) => step(describeCall(call, titleFor)),
          onResult: (call: CallRecord, index: number) => step(describeCall(call, titleFor), index - 1),
          onReview: () => step(REVIEW_STEP),
        });
        if (abort.signal.aborted) break;
        if (result.agent.stopReason === "error") throw new Error(result.agent.error);
        sections.push(toSavedAnswer({ question: sectionQuestion, result, steps: sectionSteps, library, model: setup }));
        save({ unfinished: true });
      }
      // The introduction and conclusion, from the sections written; a report is complete without them.
      if (withSynthesis && !abort.signal.aborted && answeredSections(sections).length >= MIN_SYNTHESIS_SECTIONS) {
        steps.push(SYNTHESIS_STEP);
        setState({ phase: "running", steps: [...steps], reportId: id });
        written = await writeSynthesis({ model, title: reportPlan.title, request, sections, titleFor, signal: abort.signal });
        if (!written && !abort.signal.aborted) steps.push("The model's introduction and conclusion could not be read, so the report has none.");
      }
      const record = save(abort.signal.aborted ? { stopped: true } : {});
      setState({ phase: "done", steps, answer: record });
    } catch (error) {
      const record = save(abort.signal.aborted ? { stopped: true } : {});
      if (abort.signal.aborted) setState({ phase: "done", steps, answer: record });
      else setState({ phase: "error", steps, message: `${describeModelError(error, settings)} The sections written before it are saved under Past answers.` });
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
    setRun({ startedAt: Date.now(), upToMinutes: settings.lastTest?.maxTaskMinutes, what: "question" });
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
    <>
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
              Questions about one document work best. {answerTimeTip(settings.lastTest)}; you can watch each step below
              and stop at any time.
            </p>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canAsk) void (mode === "report" ? planTheReport() : ask());
          }}
        >
          <label>
            {mode === "report" ? "Report topic" : "Question"}
            <textarea
              rows={3}
              value={question}
              disabled={running}
              placeholder={mode === "report" ? "For example: blockchain technology, how it works and where it is used" : "For example: What was the total income in 2024?"}
              onChange={(event) => setQuestion(event.target.value)}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              onKeyDown={(event) => {
                if (!isSubmitShortcut(event.nativeEvent)) return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
            />
          </label>
          {mode === "question" && looksLikeReport(question) && (
            <p className="hint">
              This asks for a report. A short answer can't hold one:{" "}
              <button type="button" className="link" onClick={() => setMode("report")}>
                Write a report
              </button>{" "}
              plans it as a few questions, each answered with checked quotes.
            </p>
          )}
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
              OpenAlex (scholarly papers: abstracts, or full texts through arXiv and Europe PMC when ticked)
            </label>
            <label className="choice">
              <input type="checkbox" checked={prefs.arxiv} disabled={running} onChange={(e) => updatePrefs({ arxiv: e.target.checked })} />
              arXiv (preprints, read in full)
            </label>
            <label className="choice">
              <input type="checkbox" checked={prefs.datacite} disabled={running} onChange={(e) => updatePrefs({ datacite: e.target.checked })} />
              DataCite (repositories such as Zenodo: read in full where the PDF is open, else abstracts)
            </label>
            <label className="choice">
              <input type="checkbox" checked={prefs.europepmc} disabled={running} onChange={(e) => updatePrefs({ europepmc: e.target.checked })} />
              Europe PMC (biomedical and life-sciences papers and preprints: open-access ones read in full, others as abstracts)
            </label>
            {prefs.openalex && (
              <label className="openalex-key">
                OpenAlex API key (optional)
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={prefs.openalexKey}
                  disabled={running}
                  onChange={(e) => updatePrefs({ openalexKey: e.target.value.trim() })}
                  placeholder="Free from openalex.org"
                />
              </label>
            )}
            {prefs.openalex && (
              <div className="openalex-limits">
                <label>
                  Published from
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1900}
                    max={new Date().getFullYear() + 1}
                    placeholder="any year"
                    defaultValue={prefs.openalexFromYear ?? ""}
                    disabled={running}
                    onChange={(e) => updatePrefs({ openalexFromYear: validFromYear(e.target.value) })}
                  />
                </label>
                <label>
                  Field
                  <select value={prefs.openalexField ?? ""} disabled={running} onChange={(e) => updatePrefs({ openalexField: e.target.value })}>
                    <option value="">Any field</option>
                    {OPENALEX_FIELDS.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="choice">
                  <input type="checkbox" checked={prefs.openalexOpenAccess ?? false} disabled={running} onChange={(e) => updatePrefs({ openalexOpenAccess: e.target.checked })} />
                  Open-access works only
                </label>
              </div>
            )}
            {prefs.openalex && (prefs.arxiv || prefs.europepmc) && (
              <p className="hint">
                A paper OpenAlex finds that is also on {joinNames([...(prefs.arxiv ? ["arXiv"] : []), ...(prefs.europepmc ? ["Europe PMC"] : [])])} is read in full
                from there, not only as its abstract.
              </p>
            )}
            {prefs.openalex && (
              <p className="hint">
                Without a key, OpenAlex shares a small daily budget among everyone on your network's address, and it can run out until
                midnight UTC. A free key from <a href="https://help.openalex.org/api/authentication/">OpenAlex</a> gives you your own;
                it is kept in this browser and sent only to OpenAlex.
              </p>
            )}
            {anyOpenSource && (
              <p className="hint">
                The search words the model chooses, and the articles it opens, are requested from{" "}
                {joinNames([
                  ...openSourceNames(prefs).filter((n) => n !== "arXiv" && n !== "DataCite"),
                  ...(prefs.arxiv || prefs.datacite ? [prefs.datacite ? "DataCite" : "DataCite (for arXiv)"] : []),
                ])}
                {downloads.length ? `, and the papers it reads are downloaded from ${joinNames(downloads)}` : ""}. Your documents and your
                question as typed stay on this computer.
              </p>
            )}
          </fieldset>
          <fieldset className="mode">
            <legend>Mode</legend>
            <label className="choice">
              <input type="radio" name="mode" checked={mode === "question"} disabled={running} onChange={() => setMode("question")} />
              Ask a question
            </label>
            <label className="choice">
              <input type="radio" name="mode" checked={mode === "report"} disabled={running} onChange={() => setMode("report")} />
              Write a report
            </label>
          </fieldset>
          {usable.length === 0 && !anyOpenSource && (
            <p className="hint">Add a document above, or tick Wikipedia, OpenAlex, arXiv, DataCite or Europe PMC, to ask a question.</p>
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
            {!running && (
              <span className="hint shortcut">
                or press <kbd>{keys[0]}</kbd>+<kbd>{keys[1]}</kbd>
              </span>
            )}
          </div>
        </form>

        {planning && <p className={planning.endsWith("…") ? "progress" : "error"}>{planning}</p>}
        {plan && (
          <ReportPlanView
            plan={plan}
            maxTaskMinutes={settings.lastTest?.maxTaskMinutes}
            onChange={setPlan}
            onWrite={() => void writeReport(plan, synthesis)}
            synthesis={synthesis}
            onSynthesisChange={setSynthesis}
            writable={modelReady && !running}
            onCancel={() => setPlan(undefined)}
          />
        )}
        {state.phase !== "idle" && state.steps.length + (running ? 1 : 0) > 0 && (
          <ol className="trace" aria-live="polite" aria-label="Research steps">
            {state.steps.map((step, i) => (
              <li key={i} className={REPORT_SECTION_STEP.test(step) ? "trace-section" : undefined}>
                {step}
              </li>
            ))}
            {running && <li className="progress">Waiting for the model…</li>}
          </ol>
        )}
        {running && run && <Elapsed {...run} />}

        {(state.phase === "running" || state.phase === "done") && !!state.restored && (
          <p className="hint">
            The first {state.restored === 1 ? "step was" : `${state.restored} steps were`} restored from where the question
            stopped.
          </p>
        )}
        {pending.saveError && running && <p className="hint">{pending.saveError}</p>}
        <div ref={outcome} tabIndex={-1} className="outcome">
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
        </div>
      </section>
      <RecentAnswers
        history={history}
        shownId={state.phase === "done" ? state.answer.id : state.phase === "running" ? state.reportId : undefined}
        navigate={navigate}
      />
    </>
  );
}

/**
 * The time a running question or report has taken, against what the model test says it can take. A
 * timer, so screen readers don't announce every second (role="timer" is not a live region).
 */
function Elapsed({ startedAt, upToMinutes, what }: { startedAt: number; upToMinutes?: number; what: "question" | "report" }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = describeElapsed(now - startedAt, upToMinutes, what);
  return (
    <p className={elapsed.over ? "elapsed warning" : "elapsed hint"} role="timer">
      {elapsed.text}
    </p>
  );
}
