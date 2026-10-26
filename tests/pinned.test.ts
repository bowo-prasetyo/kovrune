import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { isValidSRI, prebuiltAppConfig } from "@mlc-ai/web-llm";
import { describeLoadProgress, describeModelError } from "../src/app/models.ts";
import { PINNED_BROWSER_MODELS } from "../src/models/browser-manifest.ts";
import { BROWSER_MODELS } from "../src/models/catalog.ts";
import {
  cachedFiles,
  deleteDownloads,
  filesToVerify,
  isDownloaded,
  moveUnpinnedDownloads,
  pinnedAppConfig,
  pinnedModel,
  sriFromHex,
  storedVerifiedFiles,
  verifyDownloads,
  type CacheLike,
  type CacheStorageLike,
  type PinnedBrowserModel,
  type VerifiedFiles,
} from "../src/models/pinned.ts";
import { CHECKING_DOWNLOAD } from "../src/models/webllm.ts";

const hex = (data: string) => createHash("sha256").update(data).digest("hex");

/** An in-memory Cache API. */
class FakeCaches implements CacheStorageLike {
  readonly stores = new Map<string, Map<string, string>>();
  async open(name: string): Promise<CacheLike> {
    const store = this.stores.get(name) ?? new Map<string, string>();
    this.stores.set(name, store);
    return {
      match: async (url) => (store.has(url) ? new Response(store.get(url)) : undefined),
      put: async (url, response) => void store.set(url, await response.text()),
      delete: async (url) => store.delete(url),
    };
  }
  put(cache: string, url: string, body: string): void {
    if (!this.stores.has(cache)) this.stores.set(cache, new Map());
    this.stores.get(cache)!.set(url, body);
  }
  get(cache: string, url: string): string | undefined {
    return this.stores.get(cache)?.get(url);
  }
}

class MemoryVerified implements VerifiedFiles {
  readonly urls = new Set<string>();
  has = (url: string) => this.urls.has(url);
  add = (urls: string[]) => urls.forEach((u) => this.urls.add(u));
  remove = (urls: string[]) => urls.forEach((u) => this.urls.delete(u));
}

const CONTENT: Record<string, string> = {
  "mlc-chat-config.json": '{"tokenizer_files":["tokenizer.json"]}',
  "tensor-cache.json": '{"records":[{"dataPath":"params_shard_0.bin"}]}',
  "tokenizer.json": "{}",
  "params_shard_0.bin": "weights",
  "lib.wasm": "wasm",
};
const file = (path: string) => ({ path, sha256: hex(CONTENT[path]!), size: CONTENT[path]!.length });
const toy: PinnedBrowserModel = {
  modelId: "Toy-q4f16_1-MLC",
  repo: "example/Toy-q4f16_1-MLC",
  revision: "a".repeat(40),
  files: ["mlc-chat-config.json", "tensor-cache.json", "tokenizer.json", "params_shard_0.bin"].map(file),
  modelLib: { repo: "example/libs", revision: "b".repeat(40), ...file("lib.wasm") },
};
const contentOf = (path: string) => CONTENT[path] ?? CONTENT["lib.wasm"]!;

/** Puts the toy model's files in the cache, pinned or under the old `main` URLs. */
function download(caches: FakeCaches, options: { unpinned?: boolean } = {}): void {
  for (const f of cachedFiles(toy, options)) caches.put(f.cache, f.url, contentOf(f.path));
}

describe("pinned browser models", () => {
  it("pins every catalog model to a commit, with a hash for every file", () => {
    const ids = BROWSER_MODELS.flatMap((m) => [m.f16.modelId, m.f32.modelId]);
    assert.deepEqual(PINNED_BROWSER_MODELS.map((m) => m.modelId).sort(), [...ids].sort());
    for (const model of PINNED_BROWSER_MODELS) {
      assert.match(model.revision, /^[0-9a-f]{40}$/, model.modelId);
      assert.match(model.modelLib.revision, /^[0-9a-f]{40}$/, model.modelId);
      const paths = model.files.map((f) => f.path);
      for (const needed of ["mlc-chat-config.json", "tensor-cache.json", "tokenizer.json", "params_shard_0.bin"]) {
        assert.ok(paths.includes(needed), `${model.modelId} lacks ${needed}`);
      }
      for (const f of [...model.files, model.modelLib]) {
        assert.match(f.sha256, /^[0-9a-f]{64}$/, `${model.modelId} ${f.path}`);
        assert.ok(f.size > 0, `${model.modelId} ${f.path}`);
      }
    }
  });

  it("downloads about as much as the catalog says", () => {
    for (const model of BROWSER_MODELS) {
      for (const variant of [model.f16, model.f32]) {
        const pinned = pinnedModel(variant.modelId)!;
        const mb = [...pinned.files, pinned.modelLib].reduce((sum, f) => sum + f.size, 0) / 1e6;
        assert.ok(Math.abs(mb - model.downloadMB) / model.downloadMB < 0.05, `${variant.modelId}: ${Math.round(mb)} MB`);
      }
    }
  });

  it("gives WebLLM pinned URLs and integrity hashes for catalog models only", () => {
    const config = pinnedAppConfig(prebuiltAppConfig);
    for (const model of PINNED_BROWSER_MODELS) {
      const record = config.model_list.find((r) => r.model_id === model.modelId)!;
      assert.equal(record.model, `https://huggingface.co/${model.repo}/resolve/${model.revision}/`);
      assert.ok(record.model_lib.includes(`/${model.modelLib.revision}/`), record.model_lib);
      assert.ok(isValidSRI(record.integrity!.config!));
      assert.ok(isValidSRI(record.integrity!.model_lib!));
      assert.ok(isValidSRI(record.integrity!.tokenizer!["tokenizer.json"]!));
      assert.equal(record.integrity!.onFailure, "error");
    }
    const other = (list: typeof config.model_list) => list.find((r) => r.model_id === "Llama-3.2-3B-Instruct-q4f16_1-MLC");
    assert.deepEqual(other(config.model_list), other(prebuiltAppConfig.model_list));
  });

  it("knows the URLs that unpinned downloads were stored under", () => {
    // The old URLs must match WebLLM's prebuilt config exactly, or existing downloads aren't found and moved.
    for (const model of PINNED_BROWSER_MODELS) {
      const record = prebuiltAppConfig.model_list.find((r) => r.model_id === model.modelId)!;
      const old = cachedFiles(model, { unpinned: true });
      assert.equal(old.find((f) => f.cache === "webllm/wasm")!.url, record.model_lib);
      assert.equal(old.find((f) => f.path === "mlc-chat-config.json")!.url, `${record.model}/resolve/main/mlc-chat-config.json`);
    }
  });

  it("writes hashes in the Subresource Integrity form", () => {
    assert.equal(sriFromHex(hex("")), "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
  });
});

describe("checking downloaded files", () => {
  it("checks files not checked before, and files the load will download", async () => {
    const caches = new FakeCaches();
    const verified = new MemoryVerified();
    assert.equal((await filesToVerify(toy, caches, verified)).length, 5);

    download(caches);
    verified.add(cachedFiles(toy).map((f) => f.url));
    assert.deepEqual(await filesToVerify(toy, caches, verified), []);

    const shard = cachedFiles(toy).find((f) => f.path === "params_shard_0.bin")!;
    caches.stores.get("webllm/model")!.delete(shard.url);
    assert.deepEqual((await filesToVerify(toy, caches, verified)).map((f) => f.path), ["params_shard_0.bin"]);
  });

  it("passes intact files and reports changed or missing ones", async () => {
    const caches = new FakeCaches();
    download(caches);
    const files = cachedFiles(toy);
    const progress: number[] = [];
    assert.deepEqual(await verifyDownloads(files, caches, (p) => progress.push(p)), []);
    assert.equal(progress.at(-1), 1);

    const shard = files.find((f) => f.path === "params_shard_0.bin")!;
    caches.put("webllm/model", shard.url, "tampered");
    const tokenizer = files.find((f) => f.path === "tokenizer.json")!;
    caches.stores.get("webllm/model")!.delete(tokenizer.url);
    assert.deepEqual((await verifyDownloads(files, caches)).map((f) => f.path).sort(), ["params_shard_0.bin", "tokenizer.json"]);
  });

  it("moves intact unpinned downloads to the pinned URLs, and drops changed ones", async () => {
    const caches = new FakeCaches();
    const verified = new MemoryVerified();
    download(caches, { unpinned: true });
    const oldShard = cachedFiles(toy, { unpinned: true }).find((f) => f.path === "params_shard_0.bin")!;
    caches.put("webllm/model", oldShard.url, "a different version");
    assert.equal(await isDownloaded(toy, caches), true);

    await moveUnpinnedDownloads(toy, caches, verified);
    for (const f of cachedFiles(toy, { unpinned: true })) assert.equal(caches.get(f.cache, f.url), undefined, f.url);
    for (const f of cachedFiles(toy)) {
      const moved = f.path !== "params_shard_0.bin";
      assert.equal(caches.get(f.cache, f.url), moved ? contentOf(f.path) : undefined, f.path);
      assert.equal(verified.has(f.url), moved, f.path);
    }
    assert.equal(await isDownloaded(toy, caches), false);
    assert.deepEqual((await filesToVerify(toy, caches, verified)).map((f) => f.path), ["params_shard_0.bin"]);
  });

  it("deletes every copy and forgets the check", async () => {
    const caches = new FakeCaches();
    const verified = new MemoryVerified();
    download(caches);
    download(caches, { unpinned: true });
    verified.add(cachedFiles(toy).map((f) => f.url));
    await deleteDownloads(toy, caches, verified);
    for (const store of caches.stores.values()) assert.equal(store.size, 0);
    assert.equal(verified.urls.size, 0);
  });

  it("keeps the record in localStorage, and checks again when storage fails", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } as Storage;
    const record = storedVerifiedFiles(storage);
    record.add(["https://a", "https://b"]);
    record.remove(["https://a"]);
    assert.equal(storedVerifiedFiles(storage).has("https://a"), false);
    assert.equal(storedVerifiedFiles(storage).has("https://b"), true);

    const broken = { getItem: () => "not json", setItem: () => { throw new Error("quota"); } } as unknown as Storage;
    const fallback = storedVerifiedFiles(broken);
    fallback.add(["https://b"]);
    assert.equal(fallback.has("https://b"), false);
  });

  it("tells the user what is happening and what went wrong", () => {
    assert.equal(describeLoadProgress({ progress: 0.5, text: CHECKING_DOWNLOAD }, 2390).text, "Checking the download against its published checksums (50%)");
    const settings = { path: "browser", modelId: "Qwen3.5-4B-q4f16_1-MLC", contextLength: 4096 } as const;
    assert.match(describeModelError(new Error("Integrity verification failed for https://x"), settings), /deleted and not used/);
  });
});
