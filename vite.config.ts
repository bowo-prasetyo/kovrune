import { defineConfig } from "vite";

// The app. The M0 benchmark page has its own config in eval/browser/.
export default defineConfig({
  // WebLLM is about 6 MB and is loaded only when the model runs in the browser.
  build: { outDir: "dist/app", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 7000 },
  // The WebLLM worker imports modules.
  worker: { format: "es" },
});
