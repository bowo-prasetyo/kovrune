import { useEffect, useRef, useState } from "react";
import type { DeviceCapabilities } from "./device.ts";
import { BUILD, REPO_URL } from "./build-info.ts";
import { HELP_URL } from "./help.ts";
import { releaseBrowserModel } from "./models.ts";
import { ResearchScreen } from "./research/ResearchScreen.tsx";
import { useSavedAnswers, useSavedDocuments } from "./research/useSavedDocuments.ts";
import { restrictConnections } from "./csp.ts";
import { pathForView, resolveRoute, routeFromPath, titleForView, type Step, type View } from "./routes.ts";
import { clearSettings, loadDraft, loadSettings, saveDraft, saveSettings, type Settings } from "./settings.ts";
import { BrowserModelStep } from "./steps/BrowserModelStep.tsx";
import { DeviceStep } from "./steps/DeviceStep.tsx";
import { ServerStep } from "./steps/ServerStep.tsx";
import { TestStep } from "./steps/TestStep.tsx";

/** Limits the page's connections to the known hosts and this setup's model server (csp.ts). Built pages only: the dev server's hot reloading connects elsewhere. */
export function restrictConnectionsTo(settings: Settings): void {
  if (import.meta.env.PROD) restrictConnections(settings.path === "local-server" ? settings.baseUrl : undefined);
}

const STEP_LABELS: Array<[Step[], string]> = [
  [["device"], "Your device"],
  [["server", "browser"], "Model"],
  [["test"], "Test model"],
];

export function App() {
  const [saved, setSaved] = useState<Settings | undefined>(loadSettings);
  const [draft, setDraft] = useState<Settings | undefined>(() => saved ?? loadDraft());
  const [caps, setCaps] = useState<DeviceCapabilities>();
  // The screen comes from the address (routes.ts), and the address follows the screen.
  const base = import.meta.env.BASE_URL;
  const [view, setView] = useState<View>(() =>
    resolveRoute(routeFromPath(location.pathname, base), { saved: !!saved, draft: !!draft, caps: false }),
  );
  const step = view.step;
  // Kept here, not in the research screen, so documents survive re-testing the model; saved in the browser.
  const library = useSavedDocuments();
  const answers = useSavedAnswers();

  /** Shows a view and gives it its address: a new history entry, or in place of the current one. */
  const navigate = (next: View, mode: "push" | "replace" = "push") => {
    setView(next);
    const path = pathForView(next, base);
    if (path !== location.pathname) window.history[mode === "push" ? "pushState" : "replaceState"](null, "", path);
  };
  const setStep = (next: Step) => navigate({ step: next });

  // Back and Forward: show what the address asks for, if it can be shown now.
  const context = useRef({ saved, draft, caps });
  context.current = { saved, draft, caps };
  useEffect(() => {
    const show = () => {
      const now = context.current;
      const next = resolveRoute(routeFromPath(location.pathname, base), { saved: !!now.saved, draft: !!now.draft, caps: !!now.caps });
      setView(next);
      const path = pathForView(next, base);
      if (path !== location.pathname) window.history.replaceState(null, "", path);
    };
    show();
    addEventListener("popstate", show);
    return () => removeEventListener("popstate", show);
  }, [base]);

  // The setup being made survives a reload, so a reload on its test stays there (per tab, in sessionStorage).
  useEffect(() => {
    if (draft && !saved) saveDraft(draft);
  }, [draft, saved]);

  // A bookmarked answer that isn't saved in this browser (removed, or saved elsewhere) opens nothing.
  useEffect(() => {
    if (view.answerId && answers.store && !answers.records.some((a) => a.id === view.answerId)) {
      navigate({ step: "research" }, "replace");
    }
  });

  const openAnswer = view.answerId ? answers.records.find((a) => a.id === view.answerId) : undefined;
  useEffect(() => {
    document.title = titleForView(view, openAnswer?.question);
  }, [view, openAnswer?.question]);

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
          // Re-testing a saved setup goes back to research: editing it needs "Change setup", which reloads (csp.ts).
          onBack={() => setStep(saved ? "research" : draft.path === "browser" && caps ? "browser" : draft.path === "browser" ? "device" : "server")}
          onPassed={() => {
            saveSettings(draft);
            restrictConnectionsTo(draft);
            setSaved(draft);
            // In place of the test's address, so Back doesn't run the test again.
            navigate({ step: "research" }, "replace");
          }}
        />
      )}
      {step === "research" && saved && (
        <ResearchScreen
          settings={saved}
          library={library}
          history={answers}
          openAnswerId={view.answerId}
          onOpenAnswer={(id) => (id ? navigate({ step: "research", answerId: id }) : navigate({ step: "research" }, "replace"))}
          onRetest={() => {
            setDraft(saved);
            setStep("test");
          }}
          onChangeSetup={() => {
            // The page's connections are limited to this setup's server; a reload lifts that for the new setup.
            saveDraft(saved);
            clearSettings();
            location.assign(base);
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
      {BUILD.kind === "release" && (
        <footer className="build">
          <a href={`${REPO_URL}/releases/tag/${BUILD.version}`} target="_blank" rel="noreferrer">
            Kovrune {BUILD.version}
          </a>
          , built from commit {BUILD.commit} ({BUILD.date}).{" "}
          <a href={`${REPO_URL}/blob/main/docs/releases.md#check-a-release-yourself`} target="_blank" rel="noreferrer">
            Check this release
          </a>
        </footer>
      )}
    </main>
  );
}
