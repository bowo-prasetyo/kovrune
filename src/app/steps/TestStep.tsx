import { useEffect, useState } from "react";
import { describeSelfCheck, runSelfCheck, type SelfCheckResult } from "../../agent/self-check.ts";
import { ollamaContextLength } from "../../models/local-endpoint.ts";
import { LoadProgressView } from "../LoadProgressView.tsx";
import { describeModelError, describeSetup, openModel, slowModelAdvice } from "../models.ts";
import { contextFromServer, SERVER_PRESETS } from "../servers.ts";
import type { Settings } from "../settings.ts";
import { useModelLoad } from "../useModelLoad.ts";

type TestState =
  | { phase: "waiting" }
  | { phase: "running"; step: 1 | 2 }
  | { phase: "done"; result: SelfCheckResult; context?: ReturnType<typeof contextFromServer> }
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
  /** With the context length to save when the server said it differs from the setting (Ollama). */
  onPassed: (result: SelfCheckResult, contextLength?: number) => void;
}) {
  const load = useModelLoad(settings);
  const [state, setState] = useState<TestState>({ phase: "waiting" });
  const [attempt, setAttempt] = useState(0);
  const ready = load.state.phase === "ready";
  const experimental = settings.path === "local-server" && SERVER_PRESETS[settings.serverKind].support === "experimental";

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setState({ phase: "running", step: 1 });
    openModel(settings)
      .then((model) =>
        runSelfCheck(model, {
          signal: controller.signal,
          onStep: (step) => setState({ phase: "running", step }),
        }),
      )
      .then(async (result) => {
        // The test has loaded the model, so Ollama can now say the context it runs it with
        // (ollamaContextLength); it cuts longer prompts without saying so.
        if (settings.path !== "local-server" || settings.serverKind !== "ollama") return setState({ phase: "done", result });
        const reported = await ollamaContextLength(settings.baseUrl, settings.model, { apiKey: settings.apiKey, signal: controller.signal });
        setState({ phase: "done", result, context: contextFromServer(reported, settings.contextLength, "ollama") });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ phase: "error", message: describeModelError(error, settings) });
      });
    return () => controller.abort();
  }, [settings, ready, attempt]);

  return (
    <section>
      <h2>Test the model</h2>
      <p>
        {describeSetup(settings)}
        {settings.path === "local-server" && (
          <>
            {" "}
            at <code>{settings.baseUrl}</code>
          </>
        )}
      </p>

      <LoadProgressView state={load.state} onRetry={load.retry} />

      {state.phase === "running" && (
        <p className="progress" aria-live="polite">
          {STEP_TEXT[state.step]} This usually takes under a minute
          {settings.path === "browser" ? " on a capable GPU" : ""}.
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

      {state.phase === "done" && state.context?.note && (
        <p className={state.context.contextLength > settings.contextLength ? "hint" : "warning"} role="status">
          {state.context.note}
        </p>
      )}

      {state.phase === "done" && state.result.passed && slowModelAdvice(settings, state.result.maxResearchTaskMinutes) && (
        <p className="warning">{slowModelAdvice(settings, state.result.maxResearchTaskMinutes)}</p>
      )}

      {state.phase === "done" && !state.result.passed && settings.path === "browser" && (
        <p className="warning">
          If the model gave garbled output, this GPU may not run browser models correctly. A local model server runs the
          same model on the CPU instead.
        </p>
      )}

      {state.phase === "done" && state.result.passed && experimental && (
        <p className="warning">
          {settings.path === "local-server" && SERVER_PRESETS[settings.serverKind].label} passed the test but is
          experimental. If research tasks repeat the same step, switch to llama.cpp server.
        </p>
      )}

      <div className="actions">
        <button onClick={onBack}>Back</button>
        {(state.phase === "done" || state.phase === "error") && (
          <button onClick={() => setAttempt((n) => n + 1)}>Test again</button>
        )}
        {state.phase === "done" && state.result.passed && !state.context?.tooSmall && (
          <button className="primary" onClick={() => onPassed(state.result, state.context?.contextLength)}>
            Save and continue
          </button>
        )}
      </div>
    </section>
  );
}
