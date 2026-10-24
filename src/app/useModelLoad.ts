import { useEffect, useState } from "react";
import { describeModelError, loadBrowserModel, type LoadProgress } from "./models.ts";
import type { Settings } from "./settings.ts";

export type ModelLoadState =
  | { phase: "loading"; progress?: LoadProgress }
  | { phase: "ready" }
  | { phase: "error"; message: string };

/** Loads the browser model for these settings (a local server needs no loading). */
export function useModelLoad(settings: Settings | undefined): { state: ModelLoadState; retry: () => void } {
  // A local server needs no loading, so its screens never flash a progress bar.
  const [state, setState] = useState<ModelLoadState>(() => (settings?.path === "browser" ? { phase: "loading" } : { phase: "ready" }));
  const [attempt, setAttempt] = useState(0);
  const modelId = settings?.path === "browser" ? settings.modelId : undefined;

  useEffect(() => {
    if (!settings) return;
    if (settings.path !== "browser") {
      setState({ phase: "ready" });
      return;
    }
    let active = true;
    setState({ phase: "loading" });
    const { promise, unsubscribe } = loadBrowserModel(settings.modelId, settings.contextLength, (progress) => {
      if (active) setState({ phase: "loading", progress });
    });
    promise.then(
      () => active && setState({ phase: "ready" }),
      (error) => active && setState({ phase: "error", message: describeModelError(error, settings) }),
    );
    return () => {
      active = false;
      unsubscribe();
    };
    // Only the model matters; settings objects are recreated on every save.
  }, [modelId, settings?.path, attempt]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}
