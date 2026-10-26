import { copyFileSync } from "node:fs";
import { defineConfig } from "vite";

// The page that replaces the app on the old GitHub Pages preview and forwards to the
// new address (redirect/main.ts). The Pages workflow publishes dist/redirect.
export default defineConfig({
  root: "redirect",
  base: "/kovrune/",
  build: {
    outDir: "../dist/redirect",
    emptyOutDir: true,
    target: "es2022",
  },
  plugins: [
    {
      // GitHub Pages serves 404.html for any other path under /kovrune/, so old links forward too.
      name: "kovrune-redirect-404",
      apply: "build",
      closeBundle() {
        copyFileSync("dist/redirect/index.html", "dist/redirect/404.html");
      },
    },
  ],
});
