import { useState } from "react";
import type { DeviceCapabilities } from "./device.ts";
import { BUILD, REPO_URL } from "./build-info.ts";
import { HELP_URL } from "./help.ts";
import { releaseBrowserModel } from "./models.ts";
import { ResearchScreen } from "./research/ResearchScreen.tsx";
import { useSavedAnswers, useSavedDocuments } from "./research/useSavedDocuments.ts";
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
  // Kept here, not in the research screen, so documents survive re-testing the model; saved in the browser.
  const library = useSavedDocuments();
  const history = useSavedAnswers();

  return (
    <main>
      <header>
        <div className="title-row">
          <h1>Kovrune</h1>
          <a href={HELP_URL} target="_blank" rel="noreferrer">
            Help
          </a>
        </div>
        <p className="tagline">Your documents. Your machine. Answers you can check.</p>
      </header>

      {step === "device" && !saved && !draft && (
        <section className="welcome">
          <h2>Welcome</h2>
          <p>
            Kovrune answers questions about your documents, and optionally Wikipedia and scholarly papers, with an AI model
            that runs on your computer. Every answer quotes its sources, and Kovrune checks that each quote is really there.
          </p>
          <p>Setup takes a few minutes: choose where the model runs, connect to it or download it, and test it.</p>
        </section>
      )}

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
          library={library}
          history={history}
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
      {BUILD.kind === "preview" && (
        <footer className="build">
          Preview build{" "}
          <a href={`${REPO_URL}/commit/${BUILD.commit}`} target="_blank" rel="noreferrer">
            {BUILD.commit}
          </a>{" "}
          ({BUILD.date}), published from <code>main</code> by GitHub Actions. Not yet a signed release.
        </footer>
      )}
    </main>
  );
}
