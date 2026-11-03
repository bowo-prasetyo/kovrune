import { useCallback, useEffect, useRef, useState } from "react";
import { listModels } from "../models/local-endpoint.ts";
import { describeMissingModel, describeServerTimeout, explainConnectionFailure, SERVER_CHECK_SECONDS } from "./servers.ts";
import type { Settings } from "./settings.ts";

export type ServerStatus =
  | { state: "checking" }
  | { state: "ok" }
  /** The server didn't answer, or answered without this setup's model. */
  | { state: "problem"; message: string };

/**
 * Whether a saved setup's model server answers and still offers its model. A local server needs no
 * loading, so the research screen used to say nothing until a question failed; it now checks when it
 * opens, when asked to, and when the user comes back to the tab after a failed check (most often from
 * the terminal where they started the server). Undefined for the browser path, which loads its model.
 */
export function useServerStatus(settings: Settings): { status?: ServerStatus; recheck: () => void } {
  const server = settings.path === "local-server" ? settings : undefined;
  const [status, setStatus] = useState<ServerStatus | undefined>(server && { state: "checking" });
  const [attempt, setAttempt] = useState(0);
  const recheck = useCallback(() => setAttempt((n) => n + 1), []);
  const failed = useRef(false);

  useEffect(() => {
    if (!server) return setStatus(undefined);
    const controller = new AbortController();
    let timedOut = false;
    let active = true;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, SERVER_CHECK_SECONDS * 1000);
    setStatus({ state: "checking" });
    listModels(server.baseUrl, { apiKey: server.apiKey, signal: controller.signal })
      .then((found) => {
        if (!active) return;
        const missing = describeMissingModel(found, server.model);
        failed.current = !!missing;
        setStatus(missing ? { state: "problem", message: missing } : { state: "ok" });
      })
      .catch(async (error: unknown) => {
        const message = timedOut ? describeServerTimeout(server.baseUrl) : await explainConnectionFailure(error, server.baseUrl);
        if (!active) return;
        failed.current = true;
        setStatus({ state: "problem", message });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [server?.baseUrl, server?.apiKey, server?.model, attempt]);

  // Back in the tab after a failed check: check again.
  useEffect(() => {
    if (!server) return;
    const again = () => {
      if (failed.current && document.visibilityState === "visible") recheck();
    };
    addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [!!server, recheck]);

  return { status, recheck };
}
