import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Cross-origin isolation enables SharedArrayBuffer, which multithreaded wllama needs.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: { headers: isolation },
  preview: { headers: isolation },
  optimizeDeps: { exclude: ["@wllama/wllama"] },
  build: { outDir: "../../dist/bench", emptyOutDir: true, target: "es2022" },
  worker: { format: "es" },
});
