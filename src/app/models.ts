// Opens the model the settings describe. A local server needs no loading; a
// browser model is loaded once per page visit (from the browser's cache after the
// first download) and shared by the model test and the research screen.

import { BROWSER_MODELS, browserModelFor, STANDARD_BROWSER_MODELS } from "../models/catalog.ts";
import { LocalEndpointModel } from "../models/local-endpoint.ts";
import type { LanguageModel } from "../models/types.ts";
import { isQuotaError } from "./research/store.ts";
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
  // STARTING_RUNNER: the worker starts, then WebLLM fetches the model's settings, program and tokenizer and opens the GPU.
  else if (report.text.startsWith("Starting the model runner")) text = "Starting the model runner and connecting to the GPU…";
  else if (report.text.startsWith("Start to fetch params")) text = "Starting the download…";
  else text = "Starting…";
  return { fraction: report.progress, text };
}

/** After this long without progress, the load screen says what may be wrong. */
export const STALLED_LOAD_MS = 60_000;

/** What to tell the user when loading has shown the same progress for a minute. */
export function stalledLoadHint(progressText: string | undefined): string {
  if (progressText?.startsWith("Preparing the GPU")) {
    return "Still preparing the GPU. On some graphics chips this takes several minutes the first time; please wait. If nothing changes for 10 minutes, reload the page and try again.";
  }
  if (progressText?.startsWith("Downloading")) {
    return "The download has not moved for a minute. Check your internet connection. If it stays stuck, reload the page and try again; finished parts are kept.";
  }
  return "Nothing has changed for a minute. Reload the page and try again. If it stops here again, a VPN, antivirus web protection or a network filter may be blocking part of the download: try with it turned off, or on another network.";
}

interface LoadedBrowserModel {
  modelId: string;
  promise: Promise<LanguageModel>;
  listeners: Set<(progress: LoadProgress) => void>;
  last?: LoadProgress;
  /** Set once loaded: whether the model's GPU device has since been lost. */
  lost?: () => boolean;
}

let browserModel: LoadedBrowserModel | undefined;

/** Loads a browser model, or joins a load already in progress. Loading another model unloads this one. */
export function loadBrowserModel(
  modelId: string,
  contextLength: number,
  onProgress?: (progress: LoadProgress) => void,
): { promise: Promise<LanguageModel>; unsubscribe: () => void } {
  // A model whose GPU device was lost is unusable; the next use loads it again (from the browser's storage).
  if (browserModelLost()) releaseBrowserModel();
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
    entry.promise.then(
      (model) => (entry.lost = () => (model as { lost?: boolean }).lost === true),
      () => {
        if (browserModel === entry) browserModel = undefined;
      },
    );
    browserModel = entry;
  }
  const entry = browserModel;
  if (onProgress) {
    entry.listeners.add(onProgress);
    if (entry.last) onProgress(entry.last);
  }
  return { promise: entry.promise, unsubscribe: () => onProgress && entry.listeners.delete(onProgress) };
}

/** Whether the loaded browser model's GPU device was lost, so it must be loaded again. */
export function browserModelLost(): boolean {
  return browserModel?.lost?.() === true;
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
      apiKey: settings.apiKey,
      extraBody: SERVER_PRESETS[settings.serverKind].extraBody,
    }),
  );
}

/** Above this, the model test suggests ways to speed the model up. */
export const SLOW_TASK_MINUTES = 10;

/**
 * Advice for a model test that passed but shows research tasks taking long, or undefined.
 * The usual cause on laptops is other programs using the memory and processor the model
 * needs (seen with large spreadsheets open: a third of the measured speed).
 */
export function slowModelAdvice(settings: Settings, maxTaskMinutes: number): string | undefined {
  if (maxTaskMinutes <= SLOW_TASK_MINUTES) return undefined;
  const advice = [
    `At this speed a research question can take up to ${Math.round(maxTaskMinutes)} minutes.`,
    "Programs that use a lot of memory or processor, such as large spreadsheets or many browser tabs, slow the model down: close them and press Test again.",
  ];
  const name = settings.path === "browser" ? (browserModelFor(settings.modelId)?.model.key ?? "") : settings.model;
  if (/4b/i.test(name)) {
    advice.push(
      settings.path === "browser"
        ? "Or choose Qwen3.5-2B, which is about twice as fast."
        : "Or switch the server to Qwen3.5-2B, which is about twice as fast (Switch models in the user guide).",
    );
  }
  if (settings.path === "local-server") {
    advice.push("If the server runs in WSL, it may have too little memory: see Troubleshooting in the user guide.");
  }
  return advice.join(" ");
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

/**
 * A caution shown on the research screen for models whose answers need more checking, undefined for
 * others. Qwen3.5-2B (docs/ai-ml-audit.md §1): on the recorded runs it refused only 5 of the 8
 * questions its documents do not answer (the target is 2 in 3), its check of its own answers said
 * yes to 3 of the 4 wrong ones it was asked about, and 13 of its 41 short answers were wrong.
 */
export function modelCaution(settings: Settings): string | undefined {
  const id = settings.path === "browser" ? settings.modelId : settings.model;
  // The experimental model (docs/m0-benchmark.md, "A smaller model"): about 1 in 5 of its answers
  // labelled Quotes found were wrong, against 1 in 15 for Qwen3.5-2B.
  if (/qwen3\.5[-_:]0\.8b(?![\p{L}\p{N}])/iu.test(id)) {
    return "Qwen3.5-0.8B is experimental and the weakest model: about 1 in 5 of its answers labelled Quotes found were wrong in testing. Check every answer against its quoted passages, and use a larger model on another computer when accuracy matters.";
  }
  if (!/qwen3\.5[-_:]2b(?![\p{L}\p{N}])/iu.test(id)) return undefined;
  return "Qwen3.5-2B is faster, but its answers are wrong more often, even with real quotes, and it sometimes answers questions your documents don't answer. Read the quoted passages before relying on an answer, or use Qwen3.5-4B when accuracy matters.";
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

/** The question asked before a downloaded model is deleted: unlike a document or an answer, it can't be undone without downloading it again. */
export function confirmModelDeletion(label: string, size: string): string {
  return `Delete ${label} (${size}) from this browser? To use it again, it has to be downloaded again.`;
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

export interface DownloadedModel {
  modelId: string;
  /** "Qwen3.5-4B" or "Qwen3.5-4B (32-bit)". */
  label: string;
  bytes: number;
}

/** The catalog models stored in this browser, with the size of their files. */
export async function downloadedBrowserModels(): Promise<DownloadedModel[]> {
  if (typeof caches === "undefined") return [];
  const { isDownloaded, pinnedModel } = await import("../models/pinned.ts");
  const found: DownloadedModel[] = [];
  for (const model of BROWSER_MODELS) {
    for (const variant of [model.f16, model.f32]) {
      const pinned = pinnedModel(variant.modelId);
      if (!pinned || !(await isDownloaded(pinned, caches).catch(() => false))) continue;
      const bytes = [...pinned.files, pinned.modelLib].reduce((sum, f) => sum + f.size, 0);
      found.push({ modelId: variant.modelId, label: `${model.label}${variant === model.f32 ? " (32-bit)" : ""}`, bytes });
    }
  }
  return found;
}

export interface StorageStatus {
  /** Bytes this site uses and may use, as the browser estimates them; undefined when it doesn't say. */
  usage?: number;
  quota?: number;
  /** Whether the browser has agreed not to clear the site's data when the disk runs low; undefined when it can't say. */
  persisted?: boolean;
}

export async function storageStatus(): Promise<StorageStatus> {
  const storage = globalThis.navigator?.storage;
  const [estimate, persisted] = await Promise.all([
    storage?.estimate?.().catch(() => undefined),
    storage?.persisted?.().catch(() => undefined),
  ]);
  return { usage: estimate?.usage, quota: estimate?.quota, persisted };
}

/** Asks the browser to keep the site's data. Returns whether it agreed. */
export async function askToKeepData(): Promise<boolean> {
  return (await globalThis.navigator?.storage?.persist?.().catch(() => false)) ?? false;
}

/**
 * What to do after the GPU device was lost. The lighter model is suggested only when there is a
 * standard one lighter than the model in use; with the lightest, the way out is another computer.
 */
function gpuLostAdvice(modelId: string): string {
  const model = browserModelFor(modelId)?.model;
  const index = model ? STANDARD_BROWSER_MODELS.indexOf(model) : -1;
  const lighter = index >= 0 && index < STANDARD_BROWSER_MODELS.length - 1 ? STANDARD_BROWSER_MODELS[index + 1] : undefined;
  return (
    "The GPU stopped responding or ran out of memory, so the model was unloaded. On Windows this shows in the console as DXGI_ERROR_DEVICE_HUNG: the GPU took too long and the graphics driver was reset. " +
    (lighter
      ? `Close other tabs and programs and try again, or use the lighter model, ${lighter.label}. On integrated graphics a local model server usually works better.`
      : `Close other tabs and programs and try again. If it fails the same way every time, this device cannot run ${model?.label ?? "the model"} in the browser: use a model server on another computer (see the user guide).`)
  );
}

/** A user-facing explanation for a failed model call or load. */
export function describeModelError(error: unknown, settings: Settings): string {
  if (settings.path === "local-server") return describeConnectionError(error, settings.baseUrl);
  const message = error instanceof Error ? error.message : String(error);
  if (/device.*lost|out of memory|OOM|allocation/i.test(message)) {
    return gpuLostAdvice(settings.modelId);
  }
  if (isQuotaError(error)) {
    return "The browser has no more storage for this site, so the model could not be stored. Free disk space, or delete a model or documents you don't need (under Storage and backup on the research screen), and try again.";
  }
  if (error instanceof Error && error.name === "RunnerLoadError") {
    return "Part of Kovrune, the model runner, could not be downloaded, so the model cannot start. Reload the page and try again. If it keeps failing, a VPN, antivirus web protection or a network filter may be cutting the connection: try with it turned off, or on another network.";
  }
  if (/Integrity verification failed/i.test(message)) {
    return "The downloaded model did not match its published checksums, so it was deleted and not used. This usually means the download was damaged; it can also mean a file on the server was changed. Try again, and if it fails again, please report it at https://github.com/bowo-prasetyo/kovrune/issues.";
  }
  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    return `The model download failed (${message}). Check your internet connection and try again; finished parts are kept.`;
  }
  return message;
}
