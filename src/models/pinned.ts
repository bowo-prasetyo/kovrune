// Pinned, verified downloads for the browser models (docs/design.md §3.4).
//
// WebLLM's prebuilt config downloads each model from the `main` revisions of its
// Hugging Face and GitHub repositories, so a change there changes what users run.
// The catalog models are pinned to the commits in browser-manifest.ts instead, and
// every file is checked against its SHA-256 there:
// - WebLLM checks the chat config, the tokenizer and the model library (WebAssembly)
//   itself, before using them, through its `integrity` option.
// - The tensor index and the weight shards are stored by the Cache API as they
//   arrive, which WebLLM does not check, so they are checked here after the load and
//   before the model is used. A file passes once; a record of passed files saves
//   hashing gigabytes on every page visit.
// Downloads made under the `main` URLs before pinning are moved to the pinned URLs if
// their hashes match, so nobody downloads the same model twice.

import type { AppConfig, ModelIntegrity, ModelRecord } from "@mlc-ai/web-llm";
import { PINNED_BROWSER_MODELS, type PinnedBrowserModel } from "./browser-manifest.ts";

export type { PinnedBrowserModel } from "./browser-manifest.ts";

/** The caches WebLLM keeps a model's files in. */
export type WebLLMCacheName = "webllm/config" | "webllm/model" | "webllm/wasm";

/** One file of a model, where WebLLM stores it, and its expected hash. */
export interface CachedFile {
  path: string;
  cache: WebLLMCacheName;
  url: string;
  sha256: string;
  size: number;
}

/** The parts of the Cache API used here, so tests can pass a fake. */
export interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
}
export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
}

/** Remembers which pinned files passed their check. */
export interface VerifiedFiles {
  has(url: string): boolean;
  add(urls: string[]): void;
  remove(urls: string[]): void;
}

export function pinnedModel(modelId: string): PinnedBrowserModel | undefined {
  return PINNED_BROWSER_MODELS.find((m) => m.modelId === modelId);
}

function modelBaseUrl(model: PinnedBrowserModel, revision: string): string {
  return `https://huggingface.co/${model.repo}/resolve/${revision}/`;
}

function modelLibUrl(model: PinnedBrowserModel, revision: string): string {
  const lib = model.modelLib;
  return `https://raw.githubusercontent.com/${lib.repo}/${revision}/${lib.path}`;
}

/**
 * Every file of a model as WebLLM stores it: under the pinned URLs, or with
 * `unpinned`, under the `main` URLs that WebLLM's prebuilt config uses.
 */
export function cachedFiles(model: PinnedBrowserModel, options: { unpinned?: boolean } = {}): CachedFile[] {
  const base = modelBaseUrl(model, options.unpinned ? "main" : model.revision);
  const files: CachedFile[] = model.files.map((file) => ({
    ...file,
    cache: file.path === "mlc-chat-config.json" ? "webllm/config" : "webllm/model",
    url: new URL(file.path, base).href,
  }));
  const lib = model.modelLib;
  files.push({
    path: lib.path,
    cache: "webllm/wasm",
    url: modelLibUrl(model, options.unpinned ? "main" : lib.revision),
    sha256: lib.sha256,
    size: lib.size,
  });
  return files;
}

/** A hex SHA-256 as a Subresource Integrity string, the form WebLLM's `integrity` option takes. */
export function sriFromHex(sha256: string): string {
  const bytes = sha256.match(/../g)!.map((byte) => parseInt(byte, 16));
  return `sha256-${btoa(String.fromCharCode(...bytes))}`;
}

function integrityOf(model: PinnedBrowserModel): ModelIntegrity {
  const byPath = new Map(model.files.map((f) => [f.path, f.sha256]));
  const tokenizer: Record<string, string> = {};
  for (const name of ["tokenizer.json", "tokenizer.model"]) {
    const hash = byPath.get(name);
    if (hash) tokenizer[name] = sriFromHex(hash);
  }
  return {
    config: sriFromHex(byPath.get("mlc-chat-config.json")!),
    model_lib: sriFromHex(model.modelLib.sha256),
    tokenizer,
    onFailure: "error",
  };
}

/** WebLLM's config with the catalog models pinned and checked; other models are left as they are. */
export function pinnedAppConfig(prebuilt: AppConfig): AppConfig {
  return {
    ...prebuilt,
    model_list: prebuilt.model_list.map((record): ModelRecord => {
      const model = pinnedModel(record.model_id);
      if (!model) return record;
      return {
        ...record,
        model: modelBaseUrl(model, model.revision),
        model_lib: modelLibUrl(model, model.modelLib.revision),
        integrity: integrityOf(model),
      };
    }),
  };
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function matches(data: ArrayBuffer, file: CachedFile): Promise<boolean> {
  return data.byteLength === file.size && (await sha256Hex(data)) === file.sha256;
}

/**
 * Moves files downloaded under the `main` URLs to the pinned URLs when their hashes
 * match, and removes the old copies either way, so they don't take up storage
 * that "Delete the download" can no longer free.
 */
export async function moveUnpinnedDownloads(
  model: PinnedBrowserModel,
  caches: CacheStorageLike,
  verified: VerifiedFiles,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const unpinned = cachedFiles(model, { unpinned: true });
  const found: { file: CachedFile; old: CachedFile; cache: CacheLike; response: Response }[] = [];
  for (const [i, file] of cachedFiles(model).entries()) {
    const old = unpinned[i]!;
    const cache = await caches.open(file.cache);
    const response = await cache.match(old.url);
    if (response) found.push({ file, old, cache, response });
  }
  if (found.length === 0) return;

  // Hashing an M1 download takes a few seconds per GB; report it like the check after a load.
  const total = found.reduce((sum, f) => sum + f.file.size, 0);
  let done = 0;
  onProgress?.(0);
  const moved: string[] = [];
  for (const { file, old, cache, response } of found) {
    if (!(await cache.match(file.url))) {
      // One file at a time: the largest shard is a few hundred MB.
      const data = await response.arrayBuffer();
      if (await matches(data, file)) {
        await cache.put(file.url, new Response(data));
        moved.push(file.url);
      }
    }
    await cache.delete(old.url);
    done += file.size;
    onProgress?.(done / total);
  }
  verified.add(moved);
}

/**
 * The files to check after the next load: those not checked before, and those not
 * in the cache yet, which the load will download.
 */
export async function filesToVerify(model: PinnedBrowserModel, caches: CacheStorageLike, verified: VerifiedFiles): Promise<CachedFile[]> {
  const result: CachedFile[] = [];
  for (const file of cachedFiles(model)) {
    if (!verified.has(file.url) || !(await (await caches.open(file.cache)).match(file.url))) result.push(file);
  }
  return result;
}

/** Checks files in the cache against their hashes. Returns the files that are missing or don't match. */
export async function verifyDownloads(
  files: CachedFile[],
  caches: CacheStorageLike,
  onProgress?: (fraction: number) => void,
): Promise<CachedFile[]> {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  let done = 0;
  const failed: CachedFile[] = [];
  for (const file of files) {
    const response = await (await caches.open(file.cache)).match(file.url);
    if (!response || !(await matches(await response.arrayBuffer(), file))) failed.push(file);
    done += file.size;
    onProgress?.(total ? done / total : 1);
  }
  return failed;
}

/** Whether every file of the model is in the cache, under the pinned or the old `main` URLs. */
export async function isDownloaded(model: PinnedBrowserModel, caches: CacheStorageLike): Promise<boolean> {
  const unpinned = cachedFiles(model, { unpinned: true });
  for (const [i, file] of cachedFiles(model).entries()) {
    const cache = await caches.open(file.cache);
    if (!(await cache.match(file.url)) && !(await cache.match(unpinned[i]!.url))) return false;
  }
  return true;
}

/** Deletes every copy of the model's files, pinned or not, and forgets that they were checked. */
export async function deleteDownloads(model: PinnedBrowserModel, caches: CacheStorageLike, verified: VerifiedFiles): Promise<void> {
  const files = [...cachedFiles(model), ...cachedFiles(model, { unpinned: true })];
  for (const file of files) await (await caches.open(file.cache)).delete(file.url);
  verified.remove(files.map((f) => f.url));
}

const VERIFIED_KEY = "kovrune.verifiedDownloads";

/**
 * The record of checked files, in localStorage. When storage is unavailable, every
 * file counts as unchecked, so the check runs on every load instead of never.
 */
export function storedVerifiedFiles(storage: Storage | undefined = globalThis.localStorage): VerifiedFiles {
  const read = (): Set<string> => {
    try {
      const parsed: unknown = JSON.parse(storage?.getItem(VERIFIED_KEY) ?? "[]");
      return new Set(Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : []);
    } catch {
      return new Set();
    }
  };
  const write = (urls: Set<string>) => {
    try {
      storage?.setItem(VERIFIED_KEY, JSON.stringify([...urls]));
    } catch {
      // Not saved: the files are checked again next time.
    }
  };
  return {
    has: (url) => read().has(url),
    add: (urls) => {
      if (urls.length === 0) return;
      const set = read();
      for (const url of urls) set.add(url);
      write(set);
    },
    remove: (urls) => {
      const set = read();
      for (const url of urls) set.delete(url);
      write(set);
    },
  };
}
