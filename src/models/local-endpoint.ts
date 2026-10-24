// OpenAI-compatible adapter for model servers on the user's machine or LAN:
// Ollama, LM Studio, llama.cpp server (docs/design.md §3.6).

import type { GenerationChunk, GenerationRequest, LanguageModel, ModelInfo } from "./types.ts";

export interface LocalEndpointOptions {
  /** Base URL including the API prefix, e.g. http://localhost:11434/v1 */
  baseUrl: string;
  model: string;
  contextLength: number;
  apiKey?: string;
  /** Extra request fields, e.g. {"chat_template_kwargs": {"enable_thinking": false}}. */
  extraBody?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: { prompt_tokens: number; completion_tokens: number } | null;
}

export class LocalEndpointModel implements LanguageModel {
  readonly info: ModelInfo;
  private readonly options: LocalEndpointOptions;

  constructor(options: LocalEndpointOptions) {
    this.options = options;
    this.info = { id: options.model, runtime: "local-endpoint", contextLength: options.contextLength };
  }

  supportsConstrainedDecoding(): boolean {
    return true;
  }

  async *generate(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    const { baseUrl, model, apiKey, extraBody, fetchImpl = fetch } = this.options;
    const body: Record<string, unknown> = {
      model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0,
      stream: true,
      stream_options: { include_usage: true },
      ...extraBody,
    };
    if (request.responseSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "action", schema: request.responseSchema, strict: true },
      };
    }

    const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Endpoint returned ${response.status}: ${await response.text()}`);
    }

    let usage: GenerationChunk["usage"];
    for await (const data of readServerSentEvents(response.body)) {
      if (data === "[DONE]") break;
      const chunk = JSON.parse(data) as StreamChunk;
      const text = chunk.choices?.[0]?.delta?.content ?? "";
      if (chunk.usage) {
        usage = { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens };
      }
      if (text) yield { text, done: false };
    }
    yield { text: "", done: true, usage };
  }

  async dispose(): Promise<void> {}
}

export async function* readServerSentEvents(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) yield data;
    }
  }
}

/** Lists model IDs from an OpenAI-compatible server (GET {baseUrl}/models). */
export async function listModels(
  baseUrl: string,
  options: { apiKey?: string; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<string[]> {
  const { apiKey, signal, fetchImpl = fetch } = options;
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    signal,
  });
  if (!response.ok) {
    throw new Error(`Server returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
  return (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
}
