import { defineConfig } from "vite";

// The app. The M0 benchmark page has its own config in eval/browser/.
export default defineConfig({
  build: { outDir: "dist/app", emptyOutDir: true, target: "es2022" },
});
