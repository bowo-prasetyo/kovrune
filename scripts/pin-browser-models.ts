// Pins the browser models to exact revisions and records the SHA-256 of every file
// WebLLM downloads for them (docs/design.md §3.4). Writes src/models/browser-manifest.ts.
//
//   npm run pin:browser-models
//
// It pins the current head of each repository. Re-running it is a deliberate model
// update: review the new revisions, and re-run the benchmark on the pinned models.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";
import { BROWSER_MODELS } from "../src/models/catalog.ts";
import type { PinnedBrowserModel, PinnedFile } from "../src/models/browser-manifest.ts";

const OUTPUT = new URL("../src/models/browser-manifest.ts", import.meta.url);

interface TreeEntry {
  type: string;
  path: string;
  size: number;
  lfs?: { oid: string; size: number };
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

async function download(url: string): Promise<Buffer> {
  return Buffer.from(await (await fetchOk(url)).arrayBuffer());
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** "https://huggingface.co/mlc-ai/X" → "mlc-ai/X". */
function hfRepo(modelUrl: string): string {
  const match = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/?$/.exec(modelUrl);
  if (!match) throw new Error(`Unexpected model URL ${modelUrl}`);
  return match[1]!;
}

/** "https://raw.githubusercontent.com/OWNER/REPO/main/PATH" → { repo, path }. */
function libLocation(libUrl: string): { repo: string; path: string } {
  const match = /^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/main\/(.+)$/.exec(libUrl);
  if (!match) throw new Error(`Unexpected model library URL ${libUrl}`);
  return { repo: match[1]!, path: match[2]! };
}

async function pinModel(modelId: string, libRevisions: Map<string, string>): Promise<PinnedBrowserModel> {
  const record = prebuiltAppConfig.model_list.find((m) => m.model_id === modelId);
  if (!record) throw new Error(`${modelId} is not in WebLLM's prebuilt list`);
  const repo = hfRepo(record.model);
  const { sha: revision } = (await (await fetchOk(`https://huggingface.co/api/models/${repo}/revision/main`)).json()) as { sha: string };
  const tree = (await (await fetchOk(`https://huggingface.co/api/models/${repo}/tree/${revision}`)).json()) as TreeEntry[];
  const base = `https://huggingface.co/${repo}/resolve/${revision}/`;

  // The files WebLLM downloads: the chat config, the tokenizer files it names, the tensor index and its shards.
  const configData = await download(base + "mlc-chat-config.json");
  const config = JSON.parse(configData.toString("utf8")) as { tokenizer_files?: string[] };
  const tensorIndexData = await download(base + "tensor-cache.json");
  const tensorIndex = JSON.parse(tensorIndexData.toString("utf8")) as { records: { dataPath: string }[] };
  const tokenizer = ["tokenizer.json", "tokenizer.model"].find((name) => config.tokenizer_files?.includes(name));
  if (!tokenizer) throw new Error(`${modelId}: no tokenizer.json or tokenizer.model in mlc-chat-config.json`);

  const files: PinnedFile[] = [
    { path: "mlc-chat-config.json", sha256: sha256(configData), size: configData.length },
    { path: "tensor-cache.json", sha256: sha256(tensorIndexData), size: tensorIndexData.length },
  ];
  for (const path of [tokenizer, ...tensorIndex.records.map((r) => r.dataPath)]) {
    const entry = tree.find((e) => e.type === "file" && e.path === path);
    if (!entry) throw new Error(`${modelId}: ${path} is not in ${repo}@${revision}`);
    if (entry.lfs) {
      // Hugging Face stores large files in Git LFS, whose ID is the file's SHA-256.
      files.push({ path, sha256: entry.lfs.oid, size: entry.lfs.size });
    } else {
      const data = await download(base + path);
      files.push({ path, sha256: sha256(data), size: data.length });
    }
  }

  const lib = libLocation(record.model_lib);
  let libRevision = libRevisions.get(lib.repo);
  if (!libRevision) {
    // GitHub's REST API is rate-limited without a token; git needs none.
    const head = execFileSync("git", ["ls-remote", `https://github.com/${lib.repo}`, "refs/heads/main"], { encoding: "utf8" });
    libRevision = head.split(/\s/)[0]!;
    if (!/^[0-9a-f]{40}$/.test(libRevision)) throw new Error(`Could not read the head of ${lib.repo}: ${head}`);
    libRevisions.set(lib.repo, libRevision);
  }
  const libData = await download(`https://raw.githubusercontent.com/${lib.repo}/${libRevision}/${lib.path}`);

  return {
    modelId,
    repo,
    revision,
    files,
    modelLib: { repo: lib.repo, revision: libRevision, path: lib.path, sha256: sha256(libData), size: libData.length },
  };
}

const libRevisions = new Map<string, string>();
const pinned: PinnedBrowserModel[] = [];
for (const model of BROWSER_MODELS) {
  for (const variant of [model.f16, model.f32]) {
    console.log(`Pinning ${variant.modelId}…`);
    pinned.push(await pinModel(variant.modelId, libRevisions));
  }
}

const header = `// Pinned revisions and SHA-256 hashes of the browser models' files (docs/design.md §3.4).
// Generated by \`npm run pin:browser-models\` on ${new Date().toISOString().slice(0, 10)}; do not edit by hand.

export interface PinnedFile {
  /** Path in the repository. */
  path: string;
  /** SHA-256 of the file, in hex. */
  sha256: string;
  /** Size in bytes. */
  size: number;
}

export interface PinnedBrowserModel {
  /** WebLLM model ID. */
  modelId: string;
  /** Hugging Face repository with the weights. */
  repo: string;
  /** Commit of that repository. */
  revision: string;
  /** Every file WebLLM downloads from it: chat config, tensor index, tokenizer and weight shards. */
  files: PinnedFile[];
  /** The compiled model library (WebAssembly), from a GitHub repository at a fixed commit. */
  modelLib: PinnedFile & { repo: string; revision: string };
}

export const PINNED_BROWSER_MODELS: PinnedBrowserModel[] = `;
writeFileSync(OUTPUT, `${header}${JSON.stringify(pinned, null, 2)};\n`);
console.log(`Wrote ${OUTPUT.pathname}`);
