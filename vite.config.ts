import { execFileSync } from "node:child_process";
import { defineConfig, type Plugin } from "vite";
import { contentSecurityPolicy } from "./src/app/csp.ts";

// The app. The M0 benchmark page has its own config in eval/browser/.
//
// The GitHub Pages workflow sets KOVRUNE_BASE=/kovrune/ and KOVRUNE_BUILD=preview, and
// the release workflow KOVRUNE_BUILD=release; local development keeps the defaults.
// A build depends only on the commit and these variables, so anyone can rebuild a
// release and compare it byte for byte (docs/releases.md).

/** The commit's date, not today's, so that rebuilding later gives the same files. */
function commitDate(): string {
  if (process.env.SOURCE_DATE_EPOCH) return new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString().slice(0, 10);
  try {
    return execFileSync("git", ["log", "-1", "--format=%cs"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const kind = process.env.KOVRUNE_BUILD === "preview" || process.env.KOVRUNE_BUILD === "release" ? process.env.KOVRUNE_BUILD : "development";
const build = {
  kind,
  commit: (process.env.GITHUB_SHA ?? "").slice(0, 7),
  date: commitDate(),
  version: kind === "release" ? (process.env.GITHUB_REF_NAME ?? "") : "",
};

/** Adds the Content Security Policy to built pages; the dev server's hot reloading needs inline scripts. */
const csp: Plugin = {
  name: "kovrune-csp",
  apply: "build",
  // Right after the charset, before any script: a meta policy covers only what follows it.
  transformIndexHtml: (html) => {
    const charset = '<meta charset="utf-8" />';
    if (!html.includes(charset)) throw new Error(`index.html needs ${charset}, after which the Content Security Policy goes`);
    return html.replace(charset, `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy()}" />`);
  },
};

export default defineConfig({
  base: process.env.KOVRUNE_BASE ?? "/",
  define: { __KOVRUNE_BUILD__: JSON.stringify(build) },
  plugins: [csp],
  // WebLLM is about 6 MB and is loaded only when the model runs in the browser.
  build: { outDir: "dist/app", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 7000 },
  // The WebLLM worker imports modules.
  worker: { format: "es" },
});
