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
/** Progress text from creating the worker until WebLLM's first report; the app's progress line recognises it. */
export const STARTING_RUNNER = "Starting the model runner";

/**
 * The worker that runs the model could not start, usually because its script did not
 * download. WebLLM would wait for it forever: on the class 1 laptop the script's download
 * was cut off (ERR_CONNECTION_RESET) and the page said "Starting…" for over five minutes.
 */
export class RunnerLoadError extends Error {
  constructor() {
    super("The model runner could not be loaded");
    this.name = "RunnerLoadError";
  }
}

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
  const reportCheck = (progress: number) => options.onProgress?.({ progress, timeElapsed: 0, text: CHECKING_DOWNLOAD });
  if (pinned) {
    await moveUnpinnedDownloads(pinned, caches, verified, reportCheck);
    toVerify = await filesToVerify(pinned, caches, verified);
  }

  options.onProgress?.({ progress: 0, timeElapsed: 0, text: STARTING_RUNNER });
  const worker = new Worker(new URL("./webllm.worker.ts", import.meta.url), { type: "module" });
  const runnerFailed = new Promise<never>((_, reject) =>
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      reject(new RunnerLoadError());
    }),
  );
  runnerFailed.catch(() => {});
  let engine: WebWorkerMLCEngine;
  try {
    engine = await Promise.race([
      CreateWebWorkerMLCEngine(
        worker,
        options.modelId,
        { appConfig: pinnedAppConfig(prebuiltAppConfig), initProgressCallback: options.onProgress },
        { context_window_size: contextLength },
      ),
      runnerFailed,
    ]);
  } catch (error) {
    worker.terminate();
    // A file that failed WebLLM's own check stays in the cache; delete it so the next attempt downloads it again.
    if (pinned && (error instanceof IntegrityError || /Integrity verification failed/.test(String(error)))) {
      await deleteDownloads(pinned, caches, verified);
    }
    throw error;
  }

  if (pinned && toVerify.length > 0) {
    reportCheck(0);
    const failed = await verifyDownloads(toVerify, caches, reportCheck);
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

/**
 * What a generation fails with once the GPU device is lost. WebLLM then unloads the model
 * in its worker, and the request in flight fails with whatever touched the freed memory
 * first: on the class 1 laptop (Intel Iris Xe, Windows) the driver reset with
 * DXGI_ERROR_DEVICE_HUNG and the model test showed "BindingError: Cannot pass deleted
 * object as a pointer of type GrammarMatcher". Later requests fail with "Model not loaded".
 * On an Android phone (Arm Mali, 4 GB) running Qwen3.5-0.8B, the first answer failed with
 * "AbortError: Failed to execute 'mapAsync' on 'GPUBuffer': A valid external Instance reference
 * no longer exists": the browser's whole GPU connection was gone, not just the model.
 */
const GPU_LOST = /deleted object|Device was lost|device.{0,20}lost|Model not loaded|Instance reference no longer exists/i;

export class WebLLMModel implements LanguageModel {
  readonly info: ModelInfo;
  /** True once the GPU device was lost; the model must be loaded again before use. */
  lost = false;
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
      let finishReason: string | undefined;
      while (true) {
        const next = await untilStopped(chunks.next());
        if (next.done) break;
        const chunk = next.value;
        if (chunk.usage) {
          usage = { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens };
        }
        finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield { text, done: false };
      }
      // interruptGenerate can end the stream quietly; report the stop like a cancelled fetch.
      signal?.throwIfAborted();
      yield { text: "", done: true, usage, ...(finishReason ? { finishReason } : {}) };
    } catch (error) {
      if (signal?.aborted || !GPU_LOST.test(String(error))) throw error;
      this.lost = true;
      // "device lost" is what describeModelError recognises; the original error is kept for the console.
      throw new Error("The GPU device was lost (the graphics driver reset or ran out of memory), so the model was unloaded", { cause: error });
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async dispose(): Promise<void> {
    await this.engine.unload();
    this.worker.terminate();
  }
}
