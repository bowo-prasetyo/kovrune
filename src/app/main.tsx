import "./zod-config.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, restrictConnectionsTo } from "./App.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { loadSettings } from "./settings.ts";
import "./styles.css";

const saved = loadSettings();
if (saved) restrictConnectionsTo(saved);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
