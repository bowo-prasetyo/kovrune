// Settings kept in the browser between visits. Only setup choices are stored;
// documents and tasks are not persisted until M2.

import { SERVER_PRESETS, type ServerKind } from "./servers.ts";

export interface Settings {
  serverKind: ServerKind;
  baseUrl: string;
  model: string;
  contextLength: number;
}

const KEY = "kovrune.settings.v1";

/** Validates stored settings; anything malformed is treated as absent. */
export function parseSettings(raw: string | null): Settings | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<Settings>;
    if (
      typeof value.serverKind === "string" &&
      value.serverKind in SERVER_PRESETS &&
      typeof value.baseUrl === "string" &&
      typeof value.model === "string" &&
      typeof value.contextLength === "number" &&
      value.contextLength >= 2048
    ) {
      return value as Settings;
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
