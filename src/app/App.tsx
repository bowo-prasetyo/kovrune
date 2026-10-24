import { useState } from "react";
import type { DeviceCapabilities } from "./device.ts";
import { releaseBrowserModel } from "./models.ts";
import { ResearchScreen } from "./research/ResearchScreen.tsx";
import type { LibraryDocument } from "./research/library.ts";
import { clearSettings, loadSettings, saveSettings, type Settings } from "./settings.ts";
import { BrowserModelStep } from "./steps/BrowserModelStep.tsx";
import { DeviceStep } from "./steps/DeviceStep.tsx";
import { ServerStep } from "./steps/ServerStep.tsx";
import { TestStep } from "./steps/TestStep.tsx";

type Step = "device" | "server" | "browser" | "test" | "research";

const STEP_LABELS: Array<[Step[], string]> = [
  [["device"], "Your device"],
  [["server", "browser"], "Model"],
  [["test"], "Test model"],
];

export function App() {
  const [saved, setSaved] = useState<Settings | undefined>(loadSettings);
  const [draft, setDraft] = useState<Settings | undefined>(saved);
  const [step, setStep] = useState<Step>(saved ? "research" : "device");
  const [caps, setCaps] = useState<DeviceCapabilities>();
  // Kept here, not in the research screen, so documents survive re-testing the model.
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);

  return (
    <main>
      <header>
        <h1>Kovrune</h1>
        <p className="tagline">Research with an AI model that runs on your own machine.</p>
      </header>

      {step !== "research" && (
        <ol className="steps" aria-label="Setup steps">
          {STEP_LABELS.map(([ids, label]) => (
            <li key={label} aria-current={ids.includes(step) ? "step" : undefined}>
              {label}
            </li>
          ))}
        </ol>
      )}

      {step === "device" && (
        <DeviceStep
          onChoose={(path, detected) => {
            setCaps(detected);
            setStep(path === "browser" ? "browser" : "server");
          }}
        />
      )}
      {step === "server" && (
        <ServerStep
          initial={draft?.path === "local-server" ? draft : undefined}
          onBack={() => setStep("device")}
          onContinue={(settings) => {
            releaseBrowserModel();
            setDraft(settings);
            setStep("test");
          }}
        />
      )}
      {step === "browser" && caps && (
        <BrowserModelStep
          caps={caps}
          initial={draft?.path === "browser" ? draft : undefined}
          onBack={() => setStep("device")}
          onContinue={(settings) => {
            setDraft(settings);
            setStep("test");
          }}
        />
      )}
      {step === "test" && draft && (
        <TestStep
          settings={draft}
          onBack={() => setStep(draft.path === "browser" && caps ? "browser" : draft.path === "browser" ? "device" : "server")}
          onPassed={() => {
            saveSettings(draft);
            setSaved(draft);
            setStep("research");
          }}
        />
      )}
      {step === "research" && saved && (
        <ResearchScreen
          settings={saved}
          documents={documents}
          onDocumentsChange={setDocuments}
          onRetest={() => {
            setDraft(saved);
            setStep("test");
          }}
          onChangeSetup={() => {
            clearSettings();
            releaseBrowserModel();
            setSaved(undefined);
            setStep("device");
          }}
        />
      )}
    </main>
  );
}
