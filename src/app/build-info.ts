// Which build of the app this is, set by vite.config.ts at build time.

export interface BuildInfo {
  kind: "preview" | "release" | "development";
  /** Short commit hash for preview and release builds, empty otherwise. */
  commit: string;
  /** The commit's date, so a rebuild gives the same files. */
  date: string;
  /** The release tag, such as "v0.1.0", for release builds; empty otherwise. */
  version: string;
}

declare const __KOVRUNE_BUILD__: BuildInfo | undefined;

export const BUILD: BuildInfo =
  typeof __KOVRUNE_BUILD__ === "undefined" ? { kind: "development", commit: "", date: "", version: "" } : __KOVRUNE_BUILD__;

/** Where the app is published (Cloudflare Pages, design §7.4); the old GitHub Pages preview forwards here. */
export const APP_URL = "https://kovrune.pages.dev/";

/** The repository the preview is built from, for the footer link. */
export const REPO_URL = "https://github.com/bowo-prasetyo/kovrune";

/** Whether the page was opened over HTTPS from a public site, where reaching a local server needs the browser's permission. */
export function isPublicHttpsPage(location: { protocol: string; hostname: string }): boolean {
  return location.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}
