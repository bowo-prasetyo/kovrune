// Opens the model the settings describe. A local server needs no loading; a
// browser model is loaded once per page visit (from the browser's cache after the
// first download) and shared by the model test and the research screen.

import { browserModelFor } from "../models/catalog.ts";
import { LocalEndpointModel } from "../models/local-endpoint.ts";
import type { LanguageModel } from "../models/types.ts";
import { describeConnectionError, modelLabel, SERVER_PRESETS } from "./servers.ts";
import type { Settings } from "./settings.ts";

export interface LoadProgress {
  /** 0 to 1. */
  fraction: number;
  text: string;
}

/** Turns WebLLM's progress report into a short line for the user. */
export function describeLoadProgress(report: { progress: number; text: string }, downloadMB: number): LoadProgress {
  const percent = Math.round(report.progress * 100);
  const mb = Math.round(report.progress * downloadMB).toLocaleString("en-US");
  const total = downloadMB.toLocaleString("en-US");
  let text: string;
  if (report.text.startsWith("Fetching param cache")) text = `Downloading the model: ${mb} of ${total} MB (${percent}%)`;
  else if (report.text.startsWith("Loading model from cache")) text = `Loading the model from this browser's storage (${percent}%)`;
  else if (report.text.startsWith("Loading GPU shader modules")) text = "Preparing the GPU…";
  else if (report.text.startsWith("Finish loading")) text = "Model loaded.";
  // CHECKING_DOWNLOAD in models/webllm.ts, not imported so WebLLM stays out of the main bundle.
  else if (report.text.startsWith("Checking the downloaded files")) text = `Checking the download against its published checksums (${percent}%)`;
  else text = "Starting…";
  return { fraction: report.progress, text };
}

interface LoadedBrowserModel {
  modelId: string;
  promise: Promise<LanguageModel>;
  listeners: Set<(progress: LoadProgress) => void>;
  last?: LoadProgress;
}

let browserModel: LoadedBrowserModel | undefined;

/** Loads a browser model, or joins a load already in progress. Loading another model unloads this one. */
export function loadBrowserModel(
  modelId: string,
  contextLength: number,
  onProgress?: (progress: LoadProgress) => void,
): { promise: Promise<LanguageModel>; unsubscribe: () => void } {
  if (browserModel?.modelId !== modelId) {
    releaseBrowserModel();
    const downloadMB = browserModelFor(modelId)?.model.downloadMB ?? 0;
    const entry: LoadedBrowserModel = { modelId, listeners: new Set(), promise: undefined! };
    entry.promise = import("../models/webllm.ts").then(({ loadWebLLMModel }) =>
      loadWebLLMModel({
        modelId,
        contextLength,
        onProgress: (report) => {
          entry.last = describeLoadProgress(report, downloadMB);
          for (const listener of entry.listeners) listener(entry.last);
        },
      }),
    );
    // A failed load is forgotten, so the next attempt starts again.
    entry.promise.catch(() => {
      if (browserModel === entry) browserModel = undefined;
    });
    browserModel = entry;
  }
  const entry = browserModel;
  if (onProgress) {
    entry.listeners.add(onProgress);
    if (entry.last) onProgress(entry.last);
  }
  return { promise: entry.promise, unsubscribe: () => onProgress && entry.listeners.delete(onProgress) };
}

/** Unloads the browser model, freeing GPU memory. */
export function releaseBrowserModel(): void {
  const entry = browserModel;
  browserModel = undefined;
  entry?.promise.then((model) => model.dispose()).catch(() => {});
}

export function openModel(settings: Settings): Promise<LanguageModel> {
  if (settings.path === "browser") return loadBrowserModel(settings.modelId, settings.contextLength).promise;
  return Promise.resolve(
    new LocalEndpointModel({
      baseUrl: settings.baseUrl,
      model: settings.model,
      contextLength: settings.contextLength,
      extraBody: SERVER_PRESETS[settings.serverKind].extraBody,
    }),
  );
}

/** "Qwen3.5-4B in this browser" or "Qwen3.5-4B-Q4_K_M.gguf on llama.cpp server". */
export function describeSetup(settings: Settings): string {
  if (settings.path === "browser") {
    const found = browserModelFor(settings.modelId);
    const name = found ? found.model.label : settings.modelId;
    return `${name}${found && found.variant === found.model.f32 ? " (32-bit)" : ""} in this browser`;
  }
  return `${modelLabel(settings.model)} on ${SERVER_PRESETS[settings.serverKind].label}`;
}

/** Whether a model is already in the browser's cache, and how much storage is free. */
export async function browserStorage(modelId: string): Promise<{ freeMB: number; downloaded: boolean }> {
  const { isDownloaded, pinnedModel } = await import("../models/pinned.ts");
  const pinned = pinnedModel(modelId);
  const [downloaded, estimate] = await Promise.all([
    pinned && typeof caches !== "undefined" ? isDownloaded(pinned, caches).catch(() => false) : false,
    navigator.storage?.estimate?.().catch(() => undefined),
  ]);
  const freeMB = estimate?.quota !== undefined ? (estimate.quota - (estimate.usage ?? 0)) / 1e6 : Infinity;
  return { freeMB, downloaded };
}

export async function deleteBrowserModel(modelId: string): Promise<void> {
  if (browserModel?.modelId === modelId) releaseBrowserModel();
  const { deleteDownloads, pinnedModel, storedVerifiedFiles } = await import("../models/pinned.ts");
  const pinned = pinnedModel(modelId);
  if (pinned) await deleteDownloads(pinned, caches, storedVerifiedFiles());
}

/** Asks the browser not to evict the downloaded model when storage runs low. */
export async function requestPersistentStorage(): Promise<void> {
  await navigator.storage?.persist?.().catch(() => false);
}

/** A user-facing explanation for a failed model call or load. */
export function describeModelError(error: unknown, settings: Settings): string {
  if (settings.path === "local-server") return describeConnectionError(error, settings.baseUrl);
  const message = error instanceof Error ? error.message : String(error);
  if (/device.*lost|out of memory|OOM|allocation/i.test(message)) {
    return `The GPU ran out of memory or stopped responding (${message}). Try the lighter model, close other tabs, or use a local model server.`;
  }
  if (/Integrity verification failed/i.test(message)) {
    return "The downloaded model did not match its published checksums, so it was deleted and not used. This usually means the download was damaged; it can also mean a file on the server was changed. Try again, and if it fails again, please report it at https://github.com/bowo-prasetyo/kovrune/issues.";
  }
  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    return `The model download failed (${message}). Check your internet connection and try again; finished parts are kept.`;
  }
  return message;
}
