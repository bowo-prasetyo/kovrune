import { useEffect, useState } from "react";
import { STALLED_LOAD_MS, stalledLoadHint } from "./models.ts";
import type { ModelLoadState } from "./useModelLoad.ts";

export function LoadProgressView({ state, onRetry }: { state: ModelLoadState; onRetry: () => void }) {
  // A load that shows the same progress for a minute gets a hint: on the class 1 laptop the
  // page said "Starting…" for over five minutes after a download was cut off.
  const progressKey = state.phase === "loading" ? `${state.progress?.text}|${state.progress?.fraction}` : state.phase;
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    setStalled(false);
    if (state.phase !== "loading") return;
    const timer = setTimeout(() => setStalled(true), STALLED_LOAD_MS);
    return () => clearTimeout(timer);
  }, [progressKey]);

  if (state.phase === "ready") return null;
  if (state.phase === "error") {
    return (
      <div className="error" role="alert">
        <p>{state.message}</p>
        <button onClick={onRetry}>Try again</button>
      </div>
    );
  }
  return (
    <div className="load-progress" aria-live="polite">
      <progress max={1} value={state.progress?.fraction ?? 0} />
      <p>{state.progress?.text ?? "Starting…"}</p>
      {stalled && <p className="hint">{stalledLoadHint(state.progress?.text)}</p>}
    </div>
  );
}
