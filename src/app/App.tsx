import { useState } from "react";
import { ResearchScreen } from "./research/ResearchScreen.tsx";
import type { LibraryDocument } from "./research/library.ts";
import { DeviceStep } from "./steps/DeviceStep.tsx";
import { ServerStep } from "./steps/ServerStep.tsx";
import { TestStep } from "./steps/TestStep.tsx";
import { clearSettings, loadSettings, saveSettings, type Settings } from "./settings.ts";

type Step = "device" | "server" | "test" | "research";

const STEP_LABELS: Array<[Step, string]> = [
  ["device", "Your device"],
  ["server", "Model server"],
  ["test", "Test model"],
];

export function App() {
  const [saved, setSaved] = useState<Settings | undefined>(loadSettings);
  const [draft, setDraft] = useState<Settings | undefined>(saved);
  const [step, setStep] = useState<Step>(saved ? "research" : "device");
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
          {STEP_LABELS.map(([id, label]) => (
            <li key={id} aria-current={id === step ? "step" : undefined}>
              {label}
            </li>
          ))}
        </ol>
      )}

      {step === "device" && <DeviceStep onContinue={() => setStep("server")} />}
      {step === "server" && (
        <ServerStep
          initial={draft}
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
          onBack={() => setStep("server")}
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
            setSaved(undefined);
            setStep("device");
          }}
        />
      )}
    </main>
  );
}
