// How a saved answer or report is shown: its label, the answer, the label's meaning, and the evidence,
// on the research screen as it arrives and on the Past answers page (AnswersScreen.tsx).

import { formatDateTime } from "../locale.ts";
import type { DiffPart, QuoteContext } from "../../agent/evidence.ts";
import type { SentenceSupport } from "../../agent/support.ts";
import type { SynthesisPart } from "../../agent/synthesis.ts";
import {
  answerToBibtex,
  answerToMarkdown,
  exportFileName,
  quotePages,
  sectionLabel,
  shownSupport,
  sourceTitle,
  SYNTHESIS_NOTE,
  type SavedAnswer,
  type SavedReport,
} from "./answers.ts";
import { download } from "./download.ts";
import { describeReportLabels, describeSynthesisBacking } from "./report.ts";
import { describeStatus, type LabelSeverity } from "./trace.ts";

export function ExportButtons({ answer }: { answer: SavedAnswer }) {
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


/** An answer with its label and evidence; `live` for the answer just given, so screen readers announce it. */
export function ResultView({ answer, live = false }: { answer: SavedAnswer; live?: boolean }): React.JSX.Element {
  if (answer.report) return <ReportView report={answer.report} live={live} />;
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
  // The label, then the answer it is about, then what the label means: the answer used to sit below a
  // paragraph of explanation, and the explanation of ⚠ was given twice.
  return (
    <div className={`result ${answer.status}`} role={live ? "status" : undefined}>
      {sourceErrors}
      <p className="status-line">
        <StatusPill label={status.label} severity={status.severity} />
      </p>
      {answer.answer && <Answer text={answer.answer} support={support} explainMarks={!status.detail.includes("⚠")} />}
      <p className={`status-detail ${status.severity}`}>{status.detail}</p>
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
                {item.context?.pages && <span className="hint">, {quotePages(answer, item)}</span>}
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

/** A mark for each kind of label, so the labels that ask the most of the reader don't look like the others. */
const STATUS_ICONS: Record<LabelSeverity, string> = { found: "✓", check: "⚠", danger: "✗", none: "–" };

/** A label with its mark, in an answer and, `small`, in the Past answers list. */
export function StatusPill({ label, severity, small = false }: { label: string; severity: LabelSeverity; small?: boolean }) {
  return (
    <span className={`status ${severity}${small ? " small" : ""}`}>
      <span className="status-icon" aria-hidden="true">
        {STATUS_ICONS[severity]}
      </span>
      {label}
    </span>
  );
}

/**
 * The answer, with the sentences no found quote backs marked. `explainMarks` adds what ⚠ means,
 * for labels whose own explanation doesn't already say it.
 */
function Answer({ text, support, explainMarks = true }: { text: string; support?: SentenceSupport; explainMarks?: boolean }) {
  const unbacked = support?.sentences.some((s) => s.backed === false);
  if (!support || !unbacked) return <p className="answer">{text}</p>;
  return (
    <>
      <p className="answer">
        {support.sentences.map((sentence, i) =>
          sentence.backed === false ? (
            <mark
              key={i}
              className="unbacked"
              title={
                sentence.inSource
                  ? `Not in a quote, but nearly word for word in ${sentence.inSource.title ? `“${sentence.inSource.title}”` : "a source"}, which the model read: “${sentence.inSource.passage}”`
                  : "No found quote shares most of this sentence's words"
              }
            >
              <span aria-label="Not backed by a quote">⚠ </span>
              {sentence.text}
              {sentence.inSource && <span className="in-source"> (in the source, not quoted) </span>}
            </mark>
          ) : (
            <span key={i}>{sentence.text}</span>
          ),
        )}
      </p>
      {explainMarks && (
        <p className="hint">
          ⚠ marks sentences that share few words with the quotes that were found, or have a number, unit, month, "not", direction such as "higher", or "significant" that the
          quotes don't back. This is a word check, not a proof: a marked sentence can still be right, and an unmarked one can still
          be wrong.
        </p>
      )}
    </>
  );
}

/** A cited document's name; open-source documents link to where they came from, with the retrieval time. */
function SourceName({ docId, answer }: { docId: string; answer: SavedAnswer }) {
  const citation = answer.citations[docId];
  if (!citation) return <span className="source">{sourceTitle(answer, docId)}</span>;
  const retrieved = formatDateTime(citation.retrievedAt);
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


/**
 * A report (docs/report-mode.md): the label summary, then each section's question and answer, with its
 * own label and evidence, in the order of the plan.
 */
function ReportView({ report, live }: { report: SavedReport; live: boolean }) {
  return (
    <div className="report" role={live ? "status" : undefined}>
      <h3>{report.title}</h3>
      <p className="report-labels">{describeReportLabels(report, sectionLabel)}</p>
      <p className="hint">
        Each section answers one question with its own quotes, checked as any answer is. Check each section against its sources:
        a section's label covers that section only.
      </p>
      {report.synthesis && (
        <section className="report-section report-synthesis">
          <h4>Introduction</h4>
          <SynthesisText part={report.synthesis.introduction} />
        </section>
      )}
      {report.sections.map((section, i) => (
        <section key={i} className="report-section">
          <h4>
            {i + 1}. {section.question}
          </h4>
          <ResultView answer={section} />
        </section>
      ))}
      {report.synthesis && (
        <section className="report-section report-synthesis">
          <h4>Conclusion</h4>
          <SynthesisText part={report.synthesis.conclusion} />
          <p className="hint">
            {SYNTHESIS_NOTE} {describeSynthesisBacking(report.synthesis)}
          </p>
        </section>
      )}
    </div>
  );
}

/** An introduction or conclusion, with the sentences no section's quote backs marked as in an answer. */
function SynthesisText({ part }: { part: SynthesisPart }) {
  return (
    <p className="answer">
      {part.support.sentences.map((sentence, i) =>
        sentence.backed === false ? (
          <mark key={i} className="unbacked" title="No section's found quote shares most of this sentence's words">
            <span aria-label="Not backed by a quote">⚠ </span>
            {sentence.text}
          </mark>
        ) : (
          <span key={i}>{sentence.text}</span>
        ),
      )}
    </p>
  );
}
