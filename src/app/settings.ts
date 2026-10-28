// Settings kept in the browser between visits: the setup choices. Documents are
// saved separately (research/store.ts); tasks are not persisted until M2.

import { browserModelFor } from "../models/catalog.ts";
import { MIN_CONTEXT_LENGTH, SERVER_PRESETS, type ServerKind } from "./servers.ts";

/** The model test's result when the setup was saved, so it can be checked later without testing again. */
export interface LastTest {
  /** ISO time. */
  at: string;
  tokensPerSecond: number;
  /** The longest a research question could take at that speed. */
  maxTaskMinutes: number;
}

export interface ServerSettings {
  path: "local-server";
  serverKind: ServerKind;
  baseUrl: string;
  model: string;
  contextLength: number;
  /** For a server started with an API key (llama.cpp's --api-key); sent with every request. */
  apiKey?: string;
  lastTest?: LastTest;
}

export interface BrowserSettings {
  path: "browser";
  /** WebLLM model ID from the catalog. */
  modelId: string;
  contextLength: number;
  lastTest?: LastTest;
}

export type Settings = ServerSettings | BrowserSettings;

/** The browser path always uses the context length the models were evaluated with. */
export const BROWSER_CONTEXT_LENGTH = 4096;

const KEY = "kovrune.settings.v1";

/** Validates stored settings; anything malformed is treated as absent. */
function parseLastTest(value: unknown): { lastTest?: LastTest } {
  const test = value as Partial<LastTest> | undefined;
  return test && typeof test.at === "string" && typeof test.tokensPerSecond === "number" && typeof test.maxTaskMinutes === "number"
    ? { lastTest: { at: test.at, tokensPerSecond: test.tokensPerSecond, maxTaskMinutes: test.maxTaskMinutes } }
    : {};
}

export function parseSettings(raw: string | null): Settings | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<Omit<ServerSettings, "path"> & Omit<BrowserSettings, "path">> & { path?: string };
    if (value.path === "browser") {
      return typeof value.modelId === "string" && browserModelFor(value.modelId)
        ? { path: "browser", modelId: value.modelId, contextLength: BROWSER_CONTEXT_LENGTH, ...parseLastTest(value.lastTest) }
        : undefined;
    }
    // Settings saved before slice 3 have no path; they are local-server settings.
    if (
      (value.path === undefined || value.path === "local-server") &&
      typeof value.serverKind === "string" &&
      value.serverKind in SERVER_PRESETS &&
      typeof value.baseUrl === "string" &&
      typeof value.model === "string" &&
      typeof value.contextLength === "number" &&
      value.contextLength >= MIN_CONTEXT_LENGTH
    ) {
      const { serverKind, baseUrl, model, contextLength, apiKey } = value as Omit<ServerSettings, "path">;
      return {
        path: "local-server",
        serverKind,
        baseUrl,
        model,
        contextLength,
        ...(typeof apiKey === "string" && apiKey ? { apiKey } : {}),
        ...parseLastTest(value.lastTest),
      };
    }
  } catch {
    // Fall through: treat as no settings.
  }
  return undefined;
}

export function loadSettings(): Settings | undefined {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return undefined;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private windows, blocked site data); settings then last for this visit only.
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

const DRAFT_KEY = "kovrune.settings.draft";

/**
 * Keeps the last setup for the reload that "Change setup" does (csp.ts), so the
 * setup form starts from it. Per tab, in sessionStorage.
 */
export function saveDraft(settings: Settings): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(settings));
  } catch {
    // The form then starts from the defaults.
  }
}

export function loadDraft(): Settings | undefined {
  try {
    return parseSettings(sessionStorage.getItem(DRAFT_KEY));
  } catch {
    return undefined;
  }
}

const CHANGING_KEY = "kovrune.changingSetup";

/**
 * Whether this tab is changing the saved setup. The saved setup stays in use, and is
 * replaced only when a new one passes its test; meanwhile the page's connections are not
 * limited to its server (csp.ts), so the setup steps can reach another one.
 */
export function isChangingSetup(): boolean {
  try {
    return sessionStorage.getItem(CHANGING_KEY) === "1";
  } catch {
    return false;
  }
}

export function setChangingSetup(changing: boolean): void {
  try {
    if (changing) sessionStorage.setItem(CHANGING_KEY, "1");
    else sessionStorage.removeItem(CHANGING_KEY);
  } catch {
    // Without sessionStorage the flag can't survive the reload; the setup steps then start as for a first setup.
  }
}

/** "tested 26 Oct, 1.6 tokens/s (a question can take up to 24 min)". */
export function describeLastTest(test: LastTest, locale?: string): string {
  const date = new Date(test.at).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const longest = test.maxTaskMinutes < 1 ? "under a minute" : `up to ${Math.round(test.maxTaskMinutes)} min`;
  return `tested ${date}, ${test.tokensPerSecond} tokens/s (a question can take ${longest})`;
}
