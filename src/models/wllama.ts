// wllama adapter: GGUF models via llama.cpp compiled to WebAssembly,
// with WebGPU offload where available (docs/design.md §3.2, advanced mode).

import { Wllama, type AssetsPathConfig } from "@wllama/wllama";
import type { GenerationChunk, GenerationRequest, LanguageModel, ModelInfo } from "./types.ts";

export interface WllamaOptions {
  /** Hugging Face repository holding the GGUF file, e.g. "unsloth/Qwen3.5-2B-GGUF". */
  repo: string;
  /** Immutable commit SHA, so the benchmarked file cannot change underneath a result. */
  revision: string;
  /** GGUF file within the repository (first shard for split models; wllama limits files to 2 GB). */
  file: string;
  assets: AssetsPathConfig;
  contextLength?: number;
  /** Layers offloaded to WebGPU; 0 forces CPU. Defaults to all layers when WebGPU is available. */
  gpuLayers?: number;
  onProgress?: (progress: { loaded: number; total: number }) => void;
}

export async function loadWllamaModel(options: WllamaOptions): Promise<LanguageModel> {
  const contextLength = options.contextLength ?? 4096;
  const wllama = new Wllama(options.assets);
  await wllama.loadModelFromUrl(
    `https://huggingface.co/${options.repo}/resolve/${options.revision}/${options.file}`,
    {
      n_ctx: contextLength,
      ...(options.gpuLayers === undefined ? {} : { n_gpu_layers: options.gpuLayers }),
      progressCallback: options.onProgress,
    },
  );
  return new WllamaModel(wllama, { id: `${options.repo}/${options.file}`, runtime: "wllama", contextLength });
}

class WllamaModel implements LanguageModel {
  readonly info: ModelInfo;
  private readonly wllama: Wllama;

  constructor(wllama: Wllama, info: ModelInfo) {
    this.wllama = wllama;
    this.info = info;
  }

  supportsConstrainedDecoding(): boolean {
    return true;
  }

  async *generate(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    const stream = await this.wllama.createChatCompletion({
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0,
      stream: true,
      abortSignal: request.signal,
      response_format: request.responseSchema
        ? { type: "json_schema", json_schema: { name: "action", schema: request.responseSchema, strict: true } }
        : undefined,
      chat_template_kwargs: { enable_thinking: false },
    });

    let usage: GenerationChunk["usage"];
    for await (const chunk of stream) {
      if (chunk.usage) {
        usage = { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens };
      } else if (chunk.timings) {
        usage = { promptTokens: chunk.timings.prompt_n, completionTokens: chunk.timings.predicted_n };
      }
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield { text, done: false };
    }
    yield { text: "", done: true, usage };
  }

  async dispose(): Promise<void> {
    await this.wllama.exit();
  }
}
