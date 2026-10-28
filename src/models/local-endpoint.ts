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
  /** How long the server may send nothing before the request fails (IDLE_TIMEOUT_MS by default). */
  idleTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * How long a model server may send nothing, while it reads the prompt or between tokens, before a
 * request fails. Generous, as a slow laptop can take a minute or more to read a long prompt, but
 * finite, so a server that hangs ends the question with an error instead of leaving it waiting.
 */
export const IDLE_TIMEOUT_MS = 5 * 60_000;

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
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

    const idleMs = this.options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
    const idle = new AbortController();
    let timer = setTimeout(() => idle.abort(), idleMs);
    const stillSending = () => {
      clearTimeout(timer);
      timer = setTimeout(() => idle.abort(), idleMs);
    };
    const signal = request.signal ? AbortSignal.any([request.signal, idle.signal]) : idle.signal;
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Endpoint returned ${response.status}: ${await response.text()}`);
      }

      let usage: GenerationChunk["usage"];
      let finishReason: string | undefined;
      for await (const data of readServerSentEvents(response.body)) {
        stillSending();
        if (data === "[DONE]") break;
        const chunk = JSON.parse(data) as StreamChunk;
        const text = chunk.choices?.[0]?.delta?.content ?? "";
        finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;
        if (chunk.usage) {
          usage = { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens };
        }
        if (text) yield { text, done: false };
      }
      yield { text: "", done: true, usage, ...(finishReason ? { finishReason } : {}) };
    } catch (error) {
      if (idle.signal.aborted && !request.signal?.aborted) {
        throw new Error(`The model server sent nothing for ${Math.round(idleMs / 1000)} seconds, so the request was stopped. Check that the server is still running.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
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

/**
 * The context each request gets on a llama.cpp server, from GET /props: its per-slot `n_ctx`, so a
 * server started with several slots (`-np`) reports its context divided between them. Undefined
 * when the server does not say (Ollama and other servers have no /props), or the request fails.
 */
export async function serverContextLength(
  baseUrl: string,
  options: { apiKey?: string; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<number | undefined> {
  const { apiKey, signal, fetchImpl = fetch } = options;
  try {
    // /props is beside the OpenAI-compatible API, not under it.
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/props`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      signal,
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { default_generation_settings?: { n_ctx?: unknown }; n_ctx?: unknown };
    const n = body.default_generation_settings?.n_ctx ?? body.n_ctx;
    return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined;
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
}
