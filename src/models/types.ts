// Application-facing model interface (docs/design.md §3.3).
// M0 implements the subset the benchmark needs; token counting and
// embeddings are added in M1.

export type Runtime = "webllm" | "wllama" | "local-endpoint" | "scripted";

export interface ModelInfo {
  id: string;
  runtime: Runtime;
  /** Context window the runtime was loaded with, in tokens. */
  contextLength: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerationRequest {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  /** JSON Schema the output must match. Ignored if the runtime cannot constrain decoding. */
  responseSchema?: object;
  signal?: AbortSignal;
}

export interface GenerationUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface GenerationChunk {
  text: string;
  done: boolean;
  /** Present on the final chunk when the runtime reports it. */
  usage?: GenerationUsage;
  /**
   * Why generation stopped, on the final chunk when the runtime reports it: "length" means the reply
   * reached maxTokens and is cut off, which servers that report no usage can still say.
   */
  finishReason?: string;
}

export interface LanguageModel {
  readonly info: ModelInfo;
  generate(request: GenerationRequest): AsyncIterable<GenerationChunk>;
  supportsConstrainedDecoding(): boolean;
  dispose(): Promise<void>;
}

/** Reasoning models may emit a think block even when asked not to; agents never see it. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
}
