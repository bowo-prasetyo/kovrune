// Settings kept in the browser between visits: the setup choices. Documents are
// saved separately (research/store.ts); tasks are not persisted until M2.

import { browserModelFor } from "../models/catalog.ts";
import { SERVER_PRESETS, type ServerKind } from "./servers.ts";

export interface ServerSettings {
  path: "local-server";
  serverKind: ServerKind;
  baseUrl: string;
  model: string;
  contextLength: number;
}

export interface BrowserSettings {
  path: "browser";
  /** WebLLM model ID from the catalog. */
  modelId: string;
  contextLength: number;
}

export type Settings = ServerSettings | BrowserSettings;

/** The browser path always uses the context length the models were evaluated with. */
export const BROWSER_CONTEXT_LENGTH = 4096;

const KEY = "kovrune.settings.v1";

/** Validates stored settings; anything malformed is treated as absent. */
export function parseSettings(raw: string | null): Settings | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<Omit<ServerSettings, "path"> & Omit<BrowserSettings, "path">> & { path?: string };
    if (value.path === "browser") {
      return typeof value.modelId === "string" && browserModelFor(value.modelId)
        ? { path: "browser", modelId: value.modelId, contextLength: BROWSER_CONTEXT_LENGTH }
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
      value.contextLength >= 2048
    ) {
      const { serverKind, baseUrl, model, contextLength } = value as Omit<ServerSettings, "path">;
      return { path: "local-server", serverKind, baseUrl, model, contextLength };
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
