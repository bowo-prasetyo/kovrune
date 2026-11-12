import { useEffect, useState } from "react";
import { BROWSER_MODELS, browserModelFor, type BrowserModel } from "../../models/catalog.ts";
import {
  checkBrowserModel,
  experimentalFallback,
  experimentalWarning,
  OTHER_COMPUTER_ADVICE,
  OTHER_COMPUTER_HELP,
  OTHER_COMPUTER_SECTION,
  recommendBrowserModel,
  tooLittleMemory,
  type DeviceCapabilities,
  type StorageInfo,
} from "../device.ts";
import { HELP_URL } from "../help.ts";
import { browserStorage, confirmModelDeletion, deleteBrowserModel, requestPersistentStorage } from "../models.ts";
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
  // Not "recommended" when even the lighter model is unlikely to fit: the warning below says so.
  const lowMemory = tooLittleMemory(caps);
  const fallback = experimentalFallback(caps);

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
              {model.key === recommended.key && !lowMemory && <span className="badge supported">recommended for this device</span>}
              {model.experimental && <span className="badge experimental">experimental</span>}
              {storage[model.key]?.downloaded && <span className="badge">downloaded</span>}
              <span className="hint">
                {" "}
                {model.description} Download {gb(model.downloadMB)}; needs about {gb(variant.vramMB)} of GPU memory.
              </span>
            </label>
          );
        })}
      </fieldset>

      {chosen.experimental && (
        <p className="warning" role="status">
          {experimentalWarning(chosen)}
        </p>
      )}

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

      {lowMemory && (
        <p className="warning">
          {OTHER_COMPUTER_ADVICE}{" "}
          <a href={HELP_URL + OTHER_COMPUTER_HELP} target="_blank" rel="noreferrer">
            {OTHER_COMPUTER_SECTION}
          </a>
          .
          {fallback && fallback.key !== chosen.key && ` Or try the experimental ${fallback.label}, which may load on this device but answers fewer questions correctly.`}
        </p>
      )}

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
            onClick={() => {
              // A model can't be brought back without downloading it again, so this asks rather than offering undo.
              if (!confirm(confirmModelDeletion(chosen.label, gb(chosen.downloadMB)))) return;
              void deleteBrowserModel(check.variant.modelId).finally(() => setRefresh((n) => n + 1));
            }}
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
