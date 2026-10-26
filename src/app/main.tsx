import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { App, restrictConnectionsTo } from "./App.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { loadSettings } from "./settings.ts";
import "./styles.css";

// Zod otherwise tries `new Function` to speed up parsing, which the Content Security Policy blocks and reports.
z.config({ jitless: true });
const saved = loadSettings();
if (saved) restrictConnectionsTo(saved);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
