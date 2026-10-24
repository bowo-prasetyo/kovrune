import { useEffect, useState } from "react";
import { describeSelfCheck, runSelfCheck, type SelfCheckResult } from "../../agent/self-check.ts";
import { LocalEndpointModel } from "../../models/local-endpoint.ts";
import { describeConnectionError, modelLabel, SERVER_PRESETS } from "../servers.ts";
import type { Settings } from "../settings.ts";

type TestState =
  | { phase: "running"; step: 1 | 2 }
  | { phase: "done"; result: SelfCheckResult }
  | { phase: "error"; message: string };

const STEP_TEXT: Record<1 | 2, string> = {
  1: "Step 1 of 2: asking the model for a first action…",
  2: "Step 2 of 2: checking that the model uses a search result…",
};

export function TestStep({
  settings,
  onBack,
  onPassed,
}: {
  settings: Settings;
  onBack: () => void;
  onPassed: () => void;
}) {
  const [state, setState] = useState<TestState>({ phase: "running", step: 1 });
  const [attempt, setAttempt] = useState(0);
  const preset = SERVER_PRESETS[settings.serverKind];

  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: "running", step: 1 });
    const model = new LocalEndpointModel({
      baseUrl: settings.baseUrl,
      model: settings.model,
      contextLength: settings.contextLength,
      extraBody: preset.extraBody,
    });
    runSelfCheck(model, {
      signal: controller.signal,
      onStep: (step) => setState({ phase: "running", step }),
    })
      .then((result) => setState({ phase: "done", result }))
      .catch((error) => {
        if (!controller.signal.aborted) setState({ phase: "error", message: describeConnectionError(error, settings.baseUrl) });
      });
    return () => controller.abort();
  }, [settings, preset, attempt]);

  return (
    <section>
      <h2>Test the model</h2>
      <p>
        {modelLabel(settings.model)} on {preset.label} at <code>{settings.baseUrl}</code>
      </p>

      {state.phase === "running" && (
        <p className="progress" aria-live="polite">
          {STEP_TEXT[state.step]} This usually takes under a minute.
        </p>
      )}

      {state.phase === "error" && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}

      {state.phase === "done" && (
        <div className={state.result.passed ? "callout" : "error"} role="status">
          <strong>{state.result.passed ? "The model works with Kovrune." : "The model test failed."}</strong>
          <ul>
            {describeSelfCheck(state.result).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {state.phase === "done" && state.result.passed && preset.support === "experimental" && (
        <p className="warning">
          {preset.label} passed the test but is experimental. If research tasks repeat the same step, switch to llama.cpp
          server.
        </p>
      )}

      <div className="actions">
        <button onClick={onBack}>Back</button>
        {state.phase !== "running" && <button onClick={() => setAttempt((n) => n + 1)}>Test again</button>}
        {state.phase === "done" && state.result.passed && (
          <button className="primary" onClick={onPassed}>
            Save and continue
          </button>
        )}
      </div>
    </section>
  );
}
