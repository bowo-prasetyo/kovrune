import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LocalEndpointModel } from "../src/models/local-endpoint.ts";

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
