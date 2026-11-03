import { useEffect, useRef, useState } from "react";
import { linkTo, type Navigate } from "../links.ts";
import { formatTime, listLabel, type SavedAnswer } from "./answers.ts";
import { ANSWER_FILTERS, describeCount, filterAnswers, recentAnswers, type AnswerFilter } from "./answers-list.ts";
import { ExportButtons, ResultView, StatusPill } from "./AnswerView.tsx";
import { DamagedNotice } from "./DamagedNotice.tsx";
import { reinsert } from "./undo.ts";
import { useUndo } from "./UndoNotice.tsx";
import type { SavedRecords } from "./useSavedDocuments.ts";

/** One saved answer in a list: its question, as a link to its page, then its label, time and model. */
function AnswerRow({ answer, navigate, onDelete }: { answer: SavedAnswer; navigate: Navigate; onDelete?: () => void }) {
  return (
    <li>
      <div className="past-row">
        <a className="past-question" {...linkTo({ step: "answers", answerId: answer.id }, navigate)}>
          {answer.question}
        </a>
        {onDelete && (
          <button className="past-delete" aria-label={`Delete “${answer.question}”`} onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
      <span className="past-meta">
        <StatusPill {...listLabel(answer)} small />{" "}
        <span className="hint">
          {formatTime(answer.askedAt)}, {answer.model}
        </span>
      </span>
    </li>
  );
}

/**
 * The research screen's few most recent answers, and a link to all of them. All past answers used to
 * be listed here, so the screen grew with every answer.
 */
export function RecentAnswers({ history, shownId, navigate }: { history: SavedRecords<SavedAnswer>; shownId?: string; navigate: Navigate }) {
  if (!history.store) return null;
  const recent = recentAnswers(history.records, shownId);
  const total = history.records.length;
  const all = linkTo({ step: "answers" }, navigate);
  return (
    <section className="recent-answers">
      <div className="section-head">
        <h2>Recent answers</h2>
        {total > 0 && <a {...all}>All past answers ({total}) →</a>}
      </div>
      {history.saveError && (
        <p className="warning" role="alert">
          {history.saveError}
        </p>
      )}
      {history.damaged.length > 0 && (
        <p className="warning">
          Some saved answers can't be read. <a {...all}>See Past answers</a>.
        </p>
      )}
      {recent.length ? (
        <ul className="past">
          {recent.map((answer) => (
            <AnswerRow key={answer.id} answer={answer} navigate={navigate} />
          ))}
        </ul>
      ) : (
        <p className="hint">
          {!history.store.persistent
            ? "This browser is not letting Kovrune save answers (for example in a private window), so they are listed only until you reload."
            : total
              ? "The answer above is saved. Earlier answers will be listed here."
              : "Answers are saved in this browser when they finish, and the latest are listed here."}
        </p>
      )}
    </section>
  );
}

/**
 * The Past answers page (/answers): every saved answer, newest first, found by its words or its label;
 * and each answer on its own page (/answers/<id>), with its evidence, steps, export and Delete.
 */
export function AnswersScreen({ history, answerId, navigate }: { history: SavedRecords<SavedAnswer>; answerId?: string; navigate: Navigate }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AnswerFilter>("all");
  // Kept across the list and an answer's page, so Undo still shows after deleting from an answer's page.
  const deletion = useUndo();
  const heading = useRef<HTMLHeadingElement>(null);

  // A new page starts at its top, with focus on its heading, as a page load would; unless an undo
  // notice has just taken focus.
  useEffect(() => {
    window.scrollTo(0, 0);
    if (!document.activeElement?.closest(".undo-notice")) heading.current?.focus({ preventScroll: true });
  }, [answerId]);

  const remove = (answer: SavedAnswer) => {
    const index = history.records.findIndex((a) => a.id === answer.id);
    history.setRecords((answers) => answers.filter((a) => a.id !== answer.id));
    deletion.offer(`Deleted “${answer.question}”.`, () => history.setRecords((answers) => reinsert(answers, answer, index)));
    if (answerId) navigate({ step: "answers" });
  };

  if (!history.store) {
    return (
      <section>
        <h2>Past answers</h2>
        <p className="hint">Loading your saved answers…</p>
      </section>
    );
  }

  const open = answerId ? history.records.find((a) => a.id === answerId) : undefined;
  if (open) {
    return (
      <section className="answer-page">
        <p className="back-link">
          <a {...linkTo({ step: "answers" }, navigate)}>← All past answers</a>
        </p>
        <h2 ref={heading} tabIndex={-1}>
          {open.question}
        </h2>
        <p className="hint">
          {open.report ? "Report written" : "Asked"} {formatTime(open.askedAt)}, {open.model}
        </p>
        <ResultView answer={open} />
        {open.steps.length > 0 && (
          <details className="past-steps">
            <summary>Steps</summary>
            <ol className="trace">
              {open.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </details>
        )}
        <div className="actions">
          <ExportButtons answer={open} />
          <button onClick={() => remove(open)}>Delete</button>
        </div>
      </section>
    );
  }

  const total = history.records.length;
  const shown = filterAnswers(history.records, query, filter);
  const searching = query.trim() !== "" || filter !== "all";
  return (
    <section className="answers-page">
      <p className="back-link">
        <a {...linkTo({ step: "research" }, navigate)}>← Back to research</a>
      </p>
      <h2 ref={heading} tabIndex={-1}>
        Past answers
      </h2>
      {history.saveError && (
        <p className="warning" role="alert">
          {history.saveError}
        </p>
      )}
      <DamagedNotice damaged={history.damaged} onDelete={history.deleteDamaged} noun="answer" />
      {deletion.notice}
      {total === 0 ? (
        <p className="hint">
          {history.store.persistent
            ? "No saved answers yet. Answers are saved in this browser when they finish."
            : "This browser is not letting Kovrune save answers (for example in a private window), so they are listed only until you reload."}
        </p>
      ) : (
        <>
          <div className="answer-filters" role="search">
            <label>
              Search
              <input type="search" value={query} placeholder="Words in a question or answer" onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label>
              Show
              <select value={filter} onChange={(e) => setFilter(e.target.value as AnswerFilter)}>
                {ANSWER_FILTERS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="hint" role="status">
            {describeCount(shown.length, total)}
          </p>
          {shown.length ? (
            <ul className="past">
              {shown.map((answer) => (
                <AnswerRow key={answer.id} answer={answer} navigate={navigate} onDelete={() => remove(answer)} />
              ))}
            </ul>
          ) : (
            <p className="hint">
              No saved answer matches.{" "}
              {searching && (
                <button
                  className="link"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Show all answers
                </button>
              )}
            </p>
          )}
          <p className="hint">
            Answers are saved in this browser only.{" "}
            <button
              className="link"
              onClick={() => {
                if (confirm(`Delete all ${total} saved answers? Documents and models are kept.`)) history.setRecords(() => []);
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
