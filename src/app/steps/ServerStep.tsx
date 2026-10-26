import { useState } from "react";
import { listModels } from "../../models/local-endpoint.ts";
import { describeConnectionError, modelLabel, RECOMMENDED_GGUF, SERVER_PRESETS, type ServerKind } from "../servers.ts";
import { isPublicHttpsPage } from "../build-info.ts";
import { accessState, addressSpaceOf, describeBlockedAccess } from "../local-access.ts";
import type { ServerSettings } from "../settings.ts";

export function ServerStep({
  initial,
  onBack,
  onContinue,
}: {
  initial?: ServerSettings;
  onBack: () => void;
  onContinue: (settings: ServerSettings) => void;
}) {
  const [kind, setKind] = useState<ServerKind>(initial?.serverKind ?? "llama.cpp");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? SERVER_PRESETS["llama.cpp"].defaultBaseUrl);
  const [contextLength, setContextLength] = useState(initial?.contextLength ?? 4096);
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [models, setModels] = useState<string[]>();
  const [model, setModel] = useState(initial?.model ?? "");
  const [status, setStatus] = useState<{ busy: boolean; error?: string }>({ busy: false });

  const preset = SERVER_PRESETS[kind];

  function chooseKind(next: ServerKind) {
    setKind(next);
    setBaseUrl(SERVER_PRESETS[next].defaultBaseUrl);
    setModels(undefined);
    setModel("");
  }

  async function connect() {
    setStatus({ busy: true });
    setModels(undefined);
    try {
      const found = await listModels(baseUrl, { apiKey: apiKey.trim() || undefined });
      if (!found.length) throw new Error("The server is running but reports no models. Load a model and try again.");
      setModels(found);
      setModel((current) => (found.includes(current) ? current : found[0]!));
      setStatus({ busy: false });
    } catch (error) {
      setStatus({ busy: false, error: await explainFailure(error, baseUrl) });
    }
  }

  return (
    <section>
      <h2>Connect to your model server</h2>

      <fieldset>
        <legend>Server</legend>
        {(Object.keys(SERVER_PRESETS) as ServerKind[]).map((id) => (
          <label key={id} className="choice">
            <input type="radio" name="server" checked={kind === id} onChange={() => chooseKind(id)} />
            {SERVER_PRESETS[id].label}{" "}
            <span className={`badge ${SERVER_PRESETS[id].support}`}>{SERVER_PRESETS[id].support}</span>
          </label>
        ))}
      </fieldset>

      {preset.support === "experimental" && (
        <p className="warning">
          {preset.label} is experimental. In testing, Ollama 0.40.10 with Qwen3.5 repeated the same search on every step;
          the model test will tell you whether your setup works.
        </p>
      )}

      {kind === "llama.cpp" && (
        <details>
          <summary>How to start llama.cpp server</summary>
          <ol>
            <li>
              Install llama.cpp from{" "}
              <a href="https://github.com/ggml-org/llama.cpp/releases" target="_blank" rel="noreferrer">
                its releases page
              </a>{" "}
              or build it from source.
            </li>
            <li>
              Download the recommended model:{" "}
              <a href={RECOMMENDED_GGUF.url} target="_blank" rel="noreferrer">
                {RECOMMENDED_GGUF.name}
              </a>
              .
            </li>
            <li>
              Start the server:
              <pre>{`llama-server -m ${RECOMMENDED_GGUF.file} -c 4096 -np 1 --jinja --port 8080`}</pre>
            </li>
          </ol>
          <p>
            On an 8 GB laptop, the smaller Qwen3.5-2B also works but answers fewer questions correctly. If the browser
            and the server run on different systems (for example Windows and WSL), add <code>--host 0.0.0.0</code>.
          </p>
        </details>
      )}

      <label>
        Server address
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
      </label>
      <label>
        API key (optional)
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <p className="hint">
        Only if the server was started with one, such as llama.cpp's <code>--api-key</code>: recommended for a server on
        another computer, so that others on the network can't use it. The key is saved in this browser.
      </p>
      <label>
        Context length (tokens)
        <input
          type="number"
          min={2048}
          step={1024}
          value={contextLength}
          onChange={(e) => setContextLength(Number(e.target.value))}
        />
      </label>

      <div className="actions">
        <button onClick={onBack}>Back</button>
        <button onClick={connect} disabled={status.busy}>
          {status.busy ? "Connecting…" : models ? "Reconnect" : "Connect"}
        </button>
      </div>

      {status.error && (
        <p className="error" role="alert">
          {status.error}
        </p>
      )}

      {models && (
        <>
          <label>
            Model
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((id) => (
                <option key={id} value={id}>
                  {modelLabel(id)}
                </option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button
              className="primary"
              disabled={!model || contextLength < 2048}
              onClick={() =>
                onContinue({
                  path: "local-server",
                  serverKind: kind,
                  baseUrl,
                  model,
                  contextLength,
                  ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
                })
              }
            >
              Test this model
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** On the public site, a browser permission is the usual cause; name it when it is. */
async function explainFailure(error: unknown, baseUrl: string): Promise<string> {
  const space = addressSpaceOf(baseUrl);
  if (space && error instanceof TypeError && isPublicHttpsPage(location)) {
    const blocked = describeBlockedAccess(space, await accessState(space));
    if (blocked) return blocked;
  }
  return describeConnectionError(error, baseUrl);
}
