import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { recommendPath } from "../src/app/device.ts";
import { isPublicHttpsPage } from "../src/app/build-info.ts";
import { accessState, addressSpaceOf, describeBlockedAccess } from "../src/app/local-access.ts";
import { describeConnectionError, modelLabel, SERVER_PRESETS } from "../src/app/servers.ts";
import { parseSettings } from "../src/app/settings.ts";
import { listModels } from "../src/models/local-endpoint.ts";

describe("device advisor", () => {
  it("recommends a local server without WebGPU or 16-bit shaders", () => {
    assert.equal(recommendPath({ webgpu: false }).path, "local-server");
    assert.equal(recommendPath({ webgpu: true, shaderF16: false, vendor: "apple" }).path, "local-server");
  });

  it("recommends a local server on the M0 class 1 laptop (Intel Gen 9 with shader-f16)", () => {
    const advice = recommendPath({ webgpu: true, shaderF16: true, vendor: "intel", architecture: "gen-9", maxBufferMiB: 2048 });
    assert.equal(advice.path, "local-server");
    assert.match(advice.reason, /Intel/);
  });

  it("recommends the browser on capable GPUs", () => {
    for (const vendor of ["apple", "nvidia", "AMD"]) {
      assert.equal(recommendPath({ webgpu: true, shaderF16: true, vendor, maxBufferMiB: 4096 }).path, "browser", vendor);
    }
  });

  it("stays conservative for unknown GPUs and small buffers", () => {
    assert.equal(recommendPath({ webgpu: true, shaderF16: true, vendor: "qualcomm" }).path, "local-server");
    assert.equal(recommendPath({ webgpu: true, shaderF16: true }).path, "local-server");
    assert.equal(recommendPath({ webgpu: true, shaderF16: true, vendor: "nvidia", maxBufferMiB: 256 }).path, "local-server");
  });
});

describe("server presets", () => {
  it("turns thinking off the way each server expects", () => {
    assert.deepEqual(SERVER_PRESETS["llama.cpp"].extraBody, { chat_template_kwargs: { enable_thinking: false } });
    assert.deepEqual(SERVER_PRESETS.ollama.extraBody, { reasoning_effort: "none" });
  });

  it("supports only llama.cpp officially (decision D2)", () => {
    assert.deepEqual(
      Object.values(SERVER_PRESETS)
        .filter((p) => p.support === "supported")
        .map((p) => p.kind),
      ["llama.cpp"],
    );
  });

  it("shows model file names instead of full paths", () => {
    assert.equal(modelLabel("/home/me/models/Qwen3.5-4B-Q4_K_M.gguf"), "Qwen3.5-4B-Q4_K_M.gguf");
    assert.equal(modelLabel("C:\\models\\qwen.gguf"), "qwen.gguf");
    assert.equal(modelLabel("hf.co/unsloth/Qwen3.5-2B-GGUF:Q4_K_M"), "Qwen3.5-2B-GGUF:Q4_K_M");
    assert.equal(modelLabel("qwen3:8b"), "qwen3:8b");
  });

  it("explains network failures in plain language", () => {
    assert.match(describeConnectionError(new TypeError("Failed to fetch"), "http://127.0.0.1:8080/v1"), /Couldn't reach http:\/\/127\.0\.0\.1:8080\/v1/);
    assert.equal(describeConnectionError(new Error("Server returned 500: boom"), "x"), "Server returned 500: boom");
  });
});

describe("settings", () => {
  const valid = { serverKind: "llama.cpp", baseUrl: "http://127.0.0.1:8080/v1", model: "qwen", contextLength: 4096 };

  it("accepts valid settings", () => {
    assert.deepEqual(parseSettings(JSON.stringify(valid)), { path: "local-server", ...valid });
  });

  it("treats missing or malformed settings as absent", () => {
    assert.equal(parseSettings(null), undefined);
    assert.equal(parseSettings("{not json"), undefined);
    assert.equal(parseSettings(JSON.stringify({ ...valid, serverKind: "cloud" })), undefined);
    assert.equal(parseSettings(JSON.stringify({ ...valid, contextLength: 512 })), undefined);
    assert.equal(parseSettings(JSON.stringify({ ...valid, model: 3 })), undefined);
  });
});

describe("listModels", () => {
  it("reads model IDs from an OpenAI-compatible /models response", async () => {
    let url = "";
    const fetchImpl = (async (input: string) => {
      url = input;
      return Response.json({ object: "list", data: [{ id: "qwen3.5-4b" }, { id: 42 }, { id: "other" }] });
    }) as typeof fetch;
    assert.deepEqual(await listModels("http://127.0.0.1:8080/v1/", { fetchImpl }), ["qwen3.5-4b", "other"]);
    assert.equal(url, "http://127.0.0.1:8080/v1/models");
  });

  it("reports HTTP errors with the server's message", async () => {
    const fetchImpl = (async () => new Response("not here", { status: 404 })) as typeof fetch;
    await assert.rejects(listModels("http://x/v1", { fetchImpl }), /404: not here/);
  });
});

describe("architecture", () => {
  it("keeps product code independent of the benchmark", async () => {
    const files: string[] = [];
    async function walk(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
      }
    }
    await walk("src");
    for (const file of files) {
      const source = await readFile(file, "utf8");
      assert.doesNotMatch(source, /from\s+["'][^"']*\beval\//, `${file} imports from eval/`);
    }
  });
});

describe("preview site", () => {
  it("knows when the page is on the public web", () => {
    assert.equal(isPublicHttpsPage({ protocol: "https:", hostname: "bowo-prasetyo.github.io" }), true);
    assert.equal(isPublicHttpsPage({ protocol: "http:", hostname: "localhost" }), false);
    assert.equal(isPublicHttpsPage({ protocol: "https:", hostname: "localhost" }), false);
  });

  it("explains the browser's local network permission on the public site", () => {
    const error = new TypeError("Failed to fetch");
    assert.match(describeConnectionError(error, "http://127.0.0.1:8080/v1", true), /"Apps on device" to Allow/);
    assert.doesNotMatch(describeConnectionError(error, "http://127.0.0.1:8080/v1", false), /Apps on device/);
  });
});

describe("local network permission", () => {
  it("tells this computer from the local network", () => {
    assert.equal(addressSpaceOf("http://127.0.0.1:8080/v1"), "loopback");
    assert.equal(addressSpaceOf("http://localhost:11434/v1"), "loopback");
    assert.equal(addressSpaceOf("http://[::1]:8080/v1"), "loopback");
    assert.equal(addressSpaceOf("http://192.168.1.20:8080/v1"), "local");
    assert.equal(addressSpaceOf("http://172.28.144.1:8080/v1"), "local", "a WSL address");
    assert.equal(addressSpaceOf("https://example.com/v1"), undefined);
  });

  it("reads the permission under the names Chrome has used, ignoring unknown ones", async () => {
    const asked: string[] = [];
    const permissions = {
      query: async ({ name }: { name: string }) => {
        asked.push(name);
        if (name === "loopback-network") throw new TypeError("not a valid permission name");
        return { state: "denied" };
      },
    };
    assert.equal(await accessState("loopback", permissions), "denied");
    assert.deepEqual(asked, ["loopback-network", "local-network-access"]);
    assert.equal(await accessState("loopback", { query: async () => Promise.reject(new TypeError("x")) }), undefined);
  });

  it("names the setting to change: Apps on device for 127.0.0.1", () => {
    // The class 1 preview check: "Permission was denied for this request to access the `loopback` address space".
    const message = describeBlockedAccess("loopback", "denied")!;
    assert.match(message, /blocking this site from reaching servers on this computer/);
    assert.match(message, /"Apps on device" to Allow/);
    assert.match(describeBlockedAccess("local", "prompt")!, /"Local network access"/);
    assert.equal(describeBlockedAccess("loopback", "granted"), undefined);
    assert.equal(describeBlockedAccess("loopback", undefined), undefined);
  });
});
