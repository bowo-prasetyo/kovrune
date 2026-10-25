import { defineConfig } from "vite";

// The app. The M0 benchmark page has its own config in eval/browser/.
//
// The GitHub Pages workflow sets KOVRUNE_BASE=/kovrune/ and KOVRUNE_BUILD=preview;
// local development keeps the defaults.
const build = {
  kind: process.env.KOVRUNE_BUILD === "preview" ? "preview" : "development",
  commit: (process.env.GITHUB_SHA ?? "").slice(0, 7),
  date: new Date().toISOString().slice(0, 10),
};

export default defineConfig({
  base: process.env.KOVRUNE_BASE ?? "/",
  define: { __KOVRUNE_BUILD__: JSON.stringify(build) },
  // WebLLM is about 6 MB and is loaded only when the model runs in the browser.
  build: { outDir: "dist/app", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 7000 },
  // The WebLLM worker imports modules.
  worker: { format: "es" },
});
