// WebLLM adapter: the primary in-browser LLM runtime (docs/design.md §3.2).
// Inference runs in a dedicated worker so the UI stays responsive.

import { CreateWebWorkerMLCEngine, type InitProgressReport, type WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import type { GenerationChunk, GenerationRequest, LanguageModel, ModelInfo } from "./types.ts";

export interface WebLLMOptions {
  /** A WebLLM prebuilt model ID, e.g. "Qwen3-4B-q4f16_1-MLC". */
  modelId: string;
  contextLength?: number;
  onProgress?: (report: InitProgressReport) => void;
}

export async function loadWebLLMModel(options: WebLLMOptions): Promise<LanguageModel> {
  const contextLength = options.contextLength ?? 4096;
  const worker = new Worker(new URL("./webllm.worker.ts", import.meta.url), { type: "module" });
  const engine = await CreateWebWorkerMLCEngine(
    worker,
    options.modelId,
    { initProgressCallback: options.onProgress },
    { context_window_size: contextLength },
  );
  return new WebLLMModel(engine, worker, { id: options.modelId, runtime: "webllm", contextLength });
}

class WebLLMModel implements LanguageModel {
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
    const stream = await this.engine.chat.completions.create({
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
    });

    const onAbort = () => this.engine.interruptGenerate();
    request.signal?.addEventListener("abort", onAbort);
    try {
      let usage: GenerationChunk["usage"];
      for await (const chunk of stream) {
        if (chunk.usage) {
          usage = { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens };
        }
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield { text, done: false };
      }
      yield { text: "", done: true, usage };
    } finally {
      request.signal?.removeEventListener("abort", onAbort);
    }
  }

  async dispose(): Promise<void> {
    await this.engine.unload();
    this.worker.terminate();
  }
}
