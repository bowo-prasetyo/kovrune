import "./zod-config.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, restrictConnectionsTo } from "./App.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { isChangingSetup, loadSettings } from "./settings.ts";
import "./styles.css";

const saved = loadSettings();
// While the setup is being changed, the setup steps must reach any server (csp.ts).
if (saved && !isChangingSetup()) restrictConnectionsTo(saved);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
