import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LocalEndpointModel, serverContextLength } from "../src/models/local-endpoint.ts";
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
