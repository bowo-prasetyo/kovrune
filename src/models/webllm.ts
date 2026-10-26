// WebLLM adapter: the primary in-browser LLM runtime (docs/design.md §3.2).
// Inference runs in a dedicated worker so the UI stays responsive.

import { CreateWebWorkerMLCEngine, IntegrityError, prebuiltAppConfig, type InitProgressReport, type WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import {
  deleteDownloads,
  filesToVerify,
  moveUnpinnedDownloads,
  pinnedAppConfig,
  pinnedModel,
  storedVerifiedFiles,
  verifyDownloads,
  type CachedFile,
} from "./pinned.ts";
import type { GenerationChunk, GenerationRequest, LanguageModel, ModelInfo } from "./types.ts";

/** Progress text while the downloaded files are checked; the app's progress line recognises it. */
export const CHECKING_DOWNLOAD = "Checking the downloaded files";

export interface WebLLMOptions {
  /** A WebLLM prebuilt model ID, e.g. "Qwen3-4B-q4f16_1-MLC". */
  modelId: string;
  contextLength?: number;
  onProgress?: (report: InitProgressReport) => void;
}

export async function loadWebLLMModel(options: WebLLMOptions): Promise<LanguageModel> {
  const contextLength = options.contextLength ?? 4096;
  // Catalog models are pinned and checked (pinned.ts); the benchmark's other candidates load as WebLLM ships them.
  const pinned = pinnedModel(options.modelId);
  const verified = storedVerifiedFiles();
  let toVerify: CachedFile[] = [];
  if (pinned) {
    await moveUnpinnedDownloads(pinned, caches, verified);
    toVerify = await filesToVerify(pinned, caches, verified);
  }

  const worker = new Worker(new URL("./webllm.worker.ts", import.meta.url), { type: "module" });
  let engine: WebWorkerMLCEngine;
  try {
    engine = await CreateWebWorkerMLCEngine(
      worker,
      options.modelId,
      { appConfig: pinnedAppConfig(prebuiltAppConfig), initProgressCallback: options.onProgress },
      { context_window_size: contextLength },
    );
  } catch (error) {
    worker.terminate();
    // A file that failed WebLLM's own check stays in the cache; delete it so the next attempt downloads it again.
    if (pinned && (error instanceof IntegrityError || /Integrity verification failed/.test(String(error)))) {
      await deleteDownloads(pinned, caches, verified);
    }
    throw error;
  }

  if (pinned && toVerify.length > 0) {
    const report = (progress: number) => options.onProgress?.({ progress, timeElapsed: 0, text: CHECKING_DOWNLOAD });
    report(0);
    const failed = await verifyDownloads(toVerify, caches, report);
    if (failed.length > 0) {
      await engine.unload().catch(() => {});
      worker.terminate();
      await deleteDownloads(pinned, caches, verified);
      const names = failed.slice(0, 3).map((f) => f.path).join(", ") + (failed.length > 3 ? ", …" : "");
      throw new Error(
        `Integrity verification failed: ${failed.length} downloaded file(s) did not match their published SHA-256 (${names}). The download was deleted; try again.`,
      );
    }
    verified.add(toVerify.map((f) => f.url));
  }
  return new WebLLMModel(engine, worker, { id: options.modelId, runtime: "webllm", contextLength });
}

export class WebLLMModel implements LanguageModel {
  readonly info: ModelInfo;
  private readonly engine: WebWorkerMLCEngine;
  private readonly worker: Worker;

  constructor(engine: WebWorkerMLCEngine, worker: Worker, info: ModelInfo) {
    this.engine = engine;
    this.worker = worker;
    this.info = info;
  }

  supportsConstrainedDecoding(): boolean {
    return true;
  }

  async *generate(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    const { signal } = request;
    signal?.throwIfAborted();
    // A stop must not wait for the engine: on a slow GPU the next token can be minutes away.
    // The engine is interrupted and winds down in its worker.
    let onAbort = () => {};
    const stopped = new Promise<never>((_, reject) => {
      onAbort = () => {
        this.engine.interruptGenerate();
        reject(signal!.reason);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    stopped.catch(() => {});
    const untilStopped = <T>(promise: Promise<T>) => (signal ? Promise.race([promise, stopped]) : promise);

    try {
      const stream = await untilStopped(
        this.engine.chat.completions.create({
          messages: request.messages,
          max_tokens: request.maxTokens,
          temperature: request.temperature ?? 0,
          stream: true,
          stream_options: { include_usage: true },
          response_format: request.responseSchema
            ? { type: "json_object", schema: JSON.stringify(request.responseSchema) }
            : undefined,
          // Qwen3-family models think by default; the benchmark measures direct answers.
          extra_body: /^Qwen3/i.test(this.info.id) ? { enable_thinking: false } : undefined,
        }),
      );
      const chunks = stream[Symbol.asyncIterator]();
      let usage: GenerationChunk["usage"];
      while (true) {
        const next = await untilStopped(chunks.next());
        if (next.done) break;
        const chunk = next.value;
        if (chunk.usage) {
          usage = { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens };
        }
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield { text, done: false };
      }
      // interruptGenerate can end the stream quietly; report the stop like a cancelled fetch.
      signal?.throwIfAborted();
      yield { text: "", done: true, usage };
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async dispose(): Promise<void> {
    await this.engine.unload();
    this.worker.terminate();
  }
}
