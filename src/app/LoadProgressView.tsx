import type { ModelLoadState } from "./useModelLoad.ts";

export function LoadProgressView({ state, onRetry }: { state: ModelLoadState; onRetry: () => void }) {
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
    </div>
  );
}
