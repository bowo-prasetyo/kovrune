import { useEffect, useState } from "react";
import { BROWSER_MODELS, browserModelFor, type BrowserModel } from "../../models/catalog.ts";
import { checkBrowserModel, recommendBrowserModel, type DeviceCapabilities, type StorageInfo } from "../device.ts";
import { browserStorage, deleteBrowserModel, requestPersistentStorage } from "../models.ts";
import { BROWSER_CONTEXT_LENGTH, type BrowserSettings } from "../settings.ts";

const gb = (mb: number) => `${(mb / 1000).toFixed(1)} GB`;

export function BrowserModelStep({
  caps,
  initial,
  onBack,
  onContinue,
}: {
  caps: DeviceCapabilities;
  initial?: BrowserSettings;
  onBack: () => void;
  onContinue: (settings: BrowserSettings) => void;
}) {
  const [chosen, setChosen] = useState<BrowserModel>(
    (initial && browserModelFor(initial.modelId)?.model) ?? recommendBrowserModel(caps),
  );
  const [storage, setStorage] = useState<Record<string, StorageInfo>>({});
  const [refresh, setRefresh] = useState(0);
  const recommended = recommendBrowserModel(caps);

  useEffect(() => {
    let cancelled = false;
    for (const model of BROWSER_MODELS) {
      const { variant } = checkBrowserModel(caps, model);
      browserStorage(variant.modelId)
        .then((info) => !cancelled && setStorage((all) => ({ ...all, [model.key]: info })))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [caps, refresh]);

  const check = checkBrowserModel(caps, chosen, storage[chosen.key]);
  const downloaded = storage[chosen.key]?.downloaded ?? false;

  return (
    <section>
      <h2>Choose a model</h2>
      <fieldset>
        <legend>Model</legend>
        {BROWSER_MODELS.map((model) => {
          const { variant } = checkBrowserModel(caps, model);
          return (
            <label key={model.key} className="choice">
              <input type="radio" name="model" checked={chosen.key === model.key} onChange={() => setChosen(model)} />
              <strong>{model.label}</strong>
              {model.key === recommended.key && <span className="badge supported">recommended for this device</span>}
              {storage[model.key]?.downloaded && <span className="badge">downloaded</span>}
              <span className="hint">
                {" "}
                {model.description} Download {gb(model.downloadMB)}; needs about {gb(variant.vramMB)} of GPU memory.
              </span>
            </label>
          );
        })}
      </fieldset>

      {check.problems.map((problem) => (
        <p key={problem} className="error" role="alert">
          {problem}
        </p>
      ))}
      {check.warnings.map((warning) => (
        <p key={warning} className="warning">
          {warning}
        </p>
      ))}

      <p className="hint">
        {downloaded
          ? "This model is already stored in this browser; loading it takes a minute or less."
          : `The model is downloaded once from Hugging Face (${gb(chosen.downloadMB)}) and stored in this browser for later visits. On a typical connection this takes a few minutes.`}{" "}
        Your documents and questions never leave this computer.
      </p>

      <div className="actions">
        <button onClick={onBack}>Back</button>
        {downloaded && (
          <button
            onClick={() =>
              void deleteBrowserModel(check.variant.modelId).finally(() => setRefresh((n) => n + 1))
            }
          >
            Delete the download
          </button>
        )}
        <button
          className="primary"
          disabled={check.problems.length > 0}
          onClick={() => {
            void requestPersistentStorage();
            onContinue({ path: "browser", modelId: check.variant.modelId, contextLength: BROWSER_CONTEXT_LENGTH });
          }}
        >
          {downloaded ? "Load and test" : "Download and test"}
        </button>
      </div>
    </section>
  );
}
