import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LocalEndpointModel, ollamaContextLength, serverContextLength } from "../src/models/local-endpoint.ts";
import { contextFromServer } from "../src/app/servers.ts";

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  // Split mid-event to check that partial chunks are buffered correctly.
  const payload = events.map((e) => `data: ${e}\r\n\r\n`).join("");
  const parts = [payload.slice(0, 25), payload.slice(25)];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("LocalEndpointModel", () => {
  it("streams text, reports usage and sends the JSON schema", async () => {
    let sent: any;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return sseResponse([
        JSON.stringify({ choices: [{ delta: { content: '{"tool":' } }] }),
        JSON.stringify({ choices: [{ delta: { content: '"search"}' } }] }),
        JSON.stringify({ choices: [], usage: { prompt_tokens: 42, completion_tokens: 7 } }),
        "[DONE]",
      ]);
    }) as typeof fetch;

    const model = new LocalEndpointModel({
      baseUrl: "http://localhost:11434/v1/",
      model: "qwen3:4b",
      contextLength: 8192,
      extraBody: { chat_template_kwargs: { enable_thinking: false } },
      fetchImpl,
    });
    const schema = { type: "object" };
    let text = "";
    let usage;
    for await (const chunk of model.generate({ messages: [{ role: "user", content: "hi" }], maxTokens: 64, responseSchema: schema })) {
      text += chunk.text;
      if (chunk.usage) usage = chunk.usage;
    }

    assert.equal(sent.url, "http://localhost:11434/v1/chat/completions");
    assert.deepEqual(sent.body.response_format, { type: "json_schema", json_schema: { name: "action", schema, strict: true } });
    assert.deepEqual(sent.body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(text, '{"tool":"search"}');
    assert.deepEqual(usage, { promptTokens: 42, completionTokens: 7 });
  });

  it("reports the prompt tokens the server took from its cache, and its prompt time", async () => {
    const fetchImpl = (async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "ok" } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], timings: { cache_n: 17, prompt_n: 4, prompt_ms: 180.1 } }),
        JSON.stringify({ choices: [], usage: { prompt_tokens: 21, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 17 } } }),
        "[DONE]",
      ])) as typeof fetch;
    const model = new LocalEndpointModel({ baseUrl: "http://localhost:8080/v1", model: "m", contextLength: 4096, fetchImpl });
    const chunks = [];
    for await (const chunk of model.generate({ messages: [], maxTokens: 4 })) chunks.push(chunk);
    assert.deepEqual(chunks.at(-1)!.usage, { promptTokens: 21, completionTokens: 1, cachedTokens: 17, promptMs: 180.1 });
  });

  it("reports why generation stopped", async () => {
    const fetchImpl = (async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: '{"tool":"fin' }, finish_reason: null }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }] }),
        "[DONE]",
      ])) as typeof fetch;
    const model = new LocalEndpointModel({ baseUrl: "http://localhost:8080/v1", model: "m", contextLength: 4096, fetchImpl });
    const chunks = [];
    for await (const chunk of model.generate({ messages: [], maxTokens: 4 })) chunks.push(chunk);
    assert.equal(chunks.at(-1)!.finishReason, "length");
    assert.equal(chunks.at(-1)!.usage, undefined, "this server reports no usage");
  });

  it("stops a request when the server sends nothing for too long, and says so", async () => {
    // A server that accepts the request and then hangs.
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof fetch;
    const model = new LocalEndpointModel({ baseUrl: "http://localhost:8080/v1", model: "m", contextLength: 4096, idleTimeoutMs: 20, fetchImpl });
    await assert.rejects(async () => {
      for await (const _ of model.generate({ messages: [], maxTokens: 4 })) {
        // drain
      }
    }, /sent nothing for 0 seconds.*still running/);
    // A stop by the user is reported as a stop, not as a hung server.
    const stop = new AbortController();
    const stopped = model.generate({ messages: [], maxTokens: 4, signal: stop.signal })[Symbol.asyncIterator]().next();
    stop.abort();
    await assert.rejects(stopped, (error: Error) => !/sent nothing/.test(error.message));
  });

  it("counts keep-alive comments and prompt progress as the server working, not only tokens", async () => {
    // llama.cpp server reading a long prompt: headers at once, then ":" pings and progress events
    // (return_progress), each well within the idle time, the first token only after all of them.
    let sent: any;
    const encoder = new TextEncoder();
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (let i = 0; i < 4; i++) {
            await wait(15);
            controller.enqueue(encoder.encode(":\n\n"));
          }
          await wait(15);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: {} }], prompt_progress: { total: 2189, cache: 0, processed: 1673, time_ms: 189480 } })}\n\n`));
          await wait(15);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\ndata: [DONE]\n\n`));
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as typeof fetch;
    const model = new LocalEndpointModel({ baseUrl: "http://localhost:8080/v1", model: "m", contextLength: 4096, idleTimeoutMs: 40, fetchImpl });
    let text = "";
    for await (const chunk of model.generate({ messages: [], maxTokens: 4 })) text += chunk.text;
    assert.equal(text, "ok", "90 ms without a token, but never 40 ms without anything");
    assert.equal(sent.return_progress, true);
  });

  it("surfaces HTTP errors", async () => {
    const model = new LocalEndpointModel({
      baseUrl: "http://localhost:1/v1",
      model: "missing",
      contextLength: 4096,
      fetchImpl: (async () => new Response("model not found", { status: 404 })) as typeof fetch,
    });
    await assert.rejects(async () => {
      for await (const _ of model.generate({ messages: [], maxTokens: 1 })) {
        // drain
      }
    }, /404: model not found/);
  });
});

describe("the server's context (llama.cpp /props)", () => {
  const props = (body: unknown, status = 200) =>
    (async (url: string, init: RequestInit) => {
      props.calls.push({ url, auth: (init.headers as Record<string, string>).authorization });
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
  props.calls = [] as Array<{ url: string; auth?: string }>;

  it("reads the per-request context from /props, beside the /v1 API", async () => {
    // llama-server -c 8192 -np 2: each slot, so each request, gets 4096.
    const fetchImpl = props({ default_generation_settings: { n_ctx: 4096 }, total_slots: 2 });
    assert.equal(await serverContextLength("http://127.0.0.1:8080/v1/", { apiKey: "k", fetchImpl }), 4096);
    assert.deepEqual(props.calls.at(-1), { url: "http://127.0.0.1:8080/props", auth: "Bearer k" });
    assert.equal(await serverContextLength("http://127.0.0.1:8080/v1", { fetchImpl: props({ n_ctx: 2048 }) }), 2048);
  });

  it("says nothing for servers without /props, or with an answer it cannot read", async () => {
    assert.equal(await serverContextLength("http://127.0.0.1:11434/v1", { fetchImpl: props("404 page not found", 404) }), undefined);
    assert.equal(await serverContextLength("http://127.0.0.1:8080/v1", { fetchImpl: props({ default_generation_settings: {} }) }), undefined);
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    assert.equal(await serverContextLength("http://127.0.0.1:8080/v1", { fetchImpl: offline }), undefined);
  });

  it("sets the context length to the server's, and says why", () => {
    assert.deepEqual(contextFromServer(undefined, 4096), { contextLength: 4096 });
    assert.deepEqual(contextFromServer(4096, 4096), { contextLength: 4096 });
    const less = contextFromServer(4096, 8192);
    assert.equal(less.contextLength, 4096);
    assert.match(less.note!, /gives each request 4096 tokens of context.*-np 1/);
    const more = contextFromServer(8192, 4096);
    assert.equal(more.contextLength, 8192);
    assert.doesNotMatch(more.note!, /-np/);
    // llama-server -c 4096 with its default of several slots.
    const small = contextFromServer(1024, 4096);
    assert.equal(small.tooSmall, true);
    assert.match(small.note!, /only 1024 tokens.*-c 4096 -np 1/);
  });
});

describe("the context Ollama gives a model (audit N9)", () => {
  /** An Ollama that answers /api/ps and /api/show with these bodies (undefined: 404), recording its requests. */
  const ollama = (ps: unknown, show: unknown) => {
    const calls: Array<{ url: string; method: string; body?: string; auth?: string }> = [];
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body as string | undefined, auth: (init.headers as Record<string, string>)?.authorization });
      const body = url.endsWith("/api/ps") ? ps : show;
      return body === undefined ? new Response("404 page not found", { status: 404 }) : new Response(JSON.stringify(body));
    }) as typeof fetch;
    return { calls, fetchImpl };
  };
  const loaded = (name: string, context_length?: number) => ({ models: [{ name, model: name, ...(context_length ? { context_length } : {}) }] });

  it("reads the context of the loaded model from /api/ps, beside the /v1 API", async () => {
    const server = ollama(loaded("qwen3.5:4b", 2048), { parameters: "num_ctx 8192" });
    assert.equal(await ollamaContextLength("http://127.0.0.1:11434/v1/", "qwen3.5:4b", { apiKey: "k", fetchImpl: server.fetchImpl }), 2048);
    assert.deepEqual(server.calls, [{ url: "http://127.0.0.1:11434/api/ps", method: "GET", body: undefined, auth: "Bearer k" }]);
    // A model named without a tag is the ":latest" one.
    assert.equal(await ollamaContextLength("http://127.0.0.1:11434/v1", "llama3.2", { fetchImpl: ollama(loaded("llama3.2:latest", 4096), {}).fetchImpl }), 4096);
  });

  it("falls back to the model's num_ctx when the model is not loaded, or Ollama is too old to say", async () => {
    const server = ollama(loaded("other:1b", 4096), { parameters: 'stop "<|im_end|>"\nnum_ctx 8192\ntemperature 0.6' });
    assert.equal(await ollamaContextLength("http://127.0.0.1:11434/v1", "qwen3.5:4b", { fetchImpl: server.fetchImpl }), 8192);
    assert.deepEqual(server.calls.at(-1), { url: "http://127.0.0.1:11434/api/show", method: "POST", body: '{"model":"qwen3.5:4b"}', auth: undefined });
    assert.equal(await ollamaContextLength("http://127.0.0.1:11434/v1", "qwen3.5:4b", { fetchImpl: ollama(loaded("qwen3.5:4b"), { parameters: "num_ctx 4096" }).fetchImpl }), 4096);
  });

  it("says nothing when Ollama says neither, or cannot be asked", async () => {
    assert.equal(await ollamaContextLength("http://127.0.0.1:11434/v1", "qwen3.5:4b", { fetchImpl: ollama({ models: [] }, { parameters: "temperature 0.6" }).fetchImpl }), undefined);
    assert.equal(await ollamaContextLength("http://127.0.0.1:11434/v1", "qwen3.5:4b", { fetchImpl: ollama(undefined, undefined).fetchImpl }), undefined);
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    assert.equal(await ollamaContextLength("http://127.0.0.1:11434/v1", "qwen3.5:4b", { fetchImpl: offline }), undefined);
  });

  it("sets the context length to Ollama's, and warns when Ollama does not say", () => {
    const less = contextFromServer(2048, 4096, "ollama");
    assert.equal(less.contextLength, 2048);
    assert.match(less.note!, /runs this model with 2048 tokens.*OLLAMA_CONTEXT_LENGTH=4096/);
    assert.doesNotMatch(less.note!, /-np/, "no llama.cpp advice");
    assert.deepEqual(contextFromServer(4096, 4096, "ollama"), { contextLength: 4096 });
    const unknown = contextFromServer(undefined, 4096, "ollama");
    assert.equal(unknown.contextLength, 4096);
    assert.match(unknown.note!, /didn't say.*cuts prompts longer than that without saying so/);
    const small = contextFromServer(1024, 4096, "ollama");
    assert.equal(small.tooSmall, true);
    assert.match(small.note!, /only 1024 tokens/);
    assert.doesNotMatch(contextFromServer(8192, 4096, "ollama").note!, /To give it more/);
  });
});
