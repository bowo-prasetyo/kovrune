import { MAX_SECTIONS, type ReportPlan } from "../../agent/report.ts";
import { describeConsulted, describeEstimate, planEdits, planReady } from "./report.ts";

/**
 * The plan of a report, before anything is researched (docs/report-mode.md): its title and one
 * question per section, which the user can edit, reorder, add or remove, with how long it can take.
 */
export function ReportPlanView({
  plan,
  maxTaskMinutes,
  onChange,
  onWrite,
  writable,
  onCancel,
  synthesis,
  onSynthesisChange,
}: {
  plan: ReportPlan;
  /** The model test's longest question time; undefined before a test. */
  maxTaskMinutes?: number;
  onChange: (plan: ReportPlan) => void;
  /** Writes the report, section by section. */
  onWrite: () => void;
  /** Whether a report can start now: the model is ready and nothing is running. */
  writable: boolean;
  onCancel: () => void;
  /** Whether to write an introduction and conclusion after the sections (slice 5). */
  synthesis: boolean;
  onSynthesisChange: (on: boolean) => void;
}) {
  const estimate = describeEstimate(plan.sections.length, maxTaskMinutes);
  return (
    <div className="report-plan">
      <h3>Report plan</h3>
      {plan.fallback ? (
        <p className="hint">
          The model gave no plan that could be read, so the request is one section. Add the questions you want the report to
          answer, one per section.
        </p>
      ) : (
        <p className="hint">
          Each section answers one question, with quotes checked like any answer. Edit the questions, reorder them, or add and
          remove sections before the report is written.
        </p>
      )}
      {!plan.fallback && plan.consulted && (
        <p className="hint">
          {plan.consulted.length
            ? `Planned from what a search for the request found in ${describeConsulted(plan.consulted)}.`
            : "Nothing in your documents matched the request, so the plan is the model's own idea of what such a report covers."}
        </p>
      )}
      <label>
        Title
        <input type="text" value={plan.title} onChange={(e) => onChange(planEdits.setTitle(plan, e.target.value))} />
      </label>
      <ol className="plan-sections">
        {plan.sections.map((question, i) => (
          <li key={i}>
            <input
              type="text"
              aria-label={`Section ${i + 1} question`}
              value={question}
              onChange={(e) => onChange(planEdits.setQuestion(plan, i, e.target.value))}
            />
            <span className="plan-buttons">
              <button type="button" aria-label={`Move section ${i + 1} up`} disabled={i === 0} onClick={() => onChange(planEdits.move(plan, i, -1))}>
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move section ${i + 1} down`}
                disabled={i === plan.sections.length - 1}
                onClick={() => onChange(planEdits.move(plan, i, 1))}
              >
                ↓
              </button>
              <button type="button" disabled={plan.sections.length <= 1} onClick={() => onChange(planEdits.remove(plan, i))}>
                Remove
              </button>
            </span>
          </li>
        ))}
      </ol>
      <label className="choice">
        <input type="checkbox" checked={synthesis} onChange={(e) => onSynthesisChange(e.target.checked)} />
        Write an introduction and conclusion from the sections (one more step). Their sentences are checked against the sections'
        quotes, and they don't change any section's label.
      </label>
      <p className={estimate.confirm ? "warning" : "hint"}>
        {estimate.text}.
        {estimate.confirm &&
          " That is a long time: you will be asked to confirm before it starts. Fewer sections, or Qwen3.5-2B for a first draft, make it faster."}
      </p>
      <div className="actions">
        <button type="button" disabled={plan.sections.length >= MAX_SECTIONS} onClick={() => onChange(planEdits.add(plan))}>
          Add a section
        </button>
        <button type="button" className="primary" disabled={!writable || !planReady(plan)} onClick={onWrite}>
          Write the report
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {!planReady(plan) && <p className="hint">Every section needs a question.</p>}
    </div>
  );
}
