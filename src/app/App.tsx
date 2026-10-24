import { useState } from "react";
import { DeviceStep } from "./steps/DeviceStep.tsx";
import { ReadyStep } from "./steps/ReadyStep.tsx";
import { ServerStep } from "./steps/ServerStep.tsx";
import { TestStep } from "./steps/TestStep.tsx";
import { clearSettings, loadSettings, saveSettings, type Settings } from "./settings.ts";

type Step = "device" | "server" | "test" | "ready";

const STEP_LABELS: Array<[Step, string]> = [
  ["device", "Your device"],
  ["server", "Model server"],
  ["test", "Test model"],
  ["ready", "Ready"],
];

export function App() {
  const [saved, setSaved] = useState<Settings | undefined>(loadSettings);
  const [draft, setDraft] = useState<Settings | undefined>(saved);
  const [step, setStep] = useState<Step>(saved ? "ready" : "device");

  return (
    <main>
      <header>
        <h1>Kovrune</h1>
        <p className="tagline">Research with an AI model that runs on your own machine.</p>
      </header>

      <ol className="steps" aria-label="Setup steps">
        {STEP_LABELS.map(([id, label]) => (
          <li key={id} aria-current={id === step ? "step" : undefined}>
            {label}
          </li>
        ))}
      </ol>

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
            setStep("ready");
          }}
        />
      )}
      {step === "ready" && saved && (
        <ReadyStep
          settings={saved}
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
