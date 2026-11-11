import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";
import { checkBrowserModel, recommendBrowserModel, type DeviceCapabilities } from "../src/app/device.ts";
import { describeLoadProgress, describeModelError, describeSetup, modelCaution, stalledLoadHint } from "../src/app/models.ts";
import { parseSettings } from "../src/app/settings.ts";
import { BROWSER_MODELS, browserModelFor, DEFAULT_BROWSER_MODEL } from "../src/models/catalog.ts";

const [qwen4b, qwen2b] = BROWSER_MODELS as [(typeof BROWSER_MODELS)[0], (typeof BROWSER_MODELS)[0]];
const capable: DeviceCapabilities = { webgpu: true, shaderF16: true, vendor: "nvidia", maxBufferMiB: 4096, ramGiB: 16 };

describe("browser model catalog", () => {
  it("matches WebLLM's prebuilt config", () => {
    const byId = new Map(prebuiltAppConfig.model_list.map((m) => [m.model_id, m]));
    for (const model of BROWSER_MODELS) {
      for (const variant of [model.f16, model.f32]) {
        const record = byId.get(variant.modelId);
        assert.ok(record, `${variant.modelId} is not in WebLLM's prebuilt list`);
        assert.equal(Math.round(record.vram_required_MB!), variant.vramMB, variant.modelId);
      }
    }
  });

  it("defaults to Qwen3.5-4B, the model the M1 targets were measured with", () => {
    assert.equal(DEFAULT_BROWSER_MODEL.f16.modelId, "Qwen3.5-4B-q4f16_1-MLC");
    assert.equal(browserModelFor("Qwen3.5-2B-q4f32_1-MLC")?.model.key, "qwen3.5-2b");
    assert.equal(browserModelFor("Llama-3.2-3B-Instruct-q4f16_1-MLC"), undefined);
  });
});

describe("browser compatibility check", () => {
  it("passes a capable GPU with the 16-bit model and no warnings", () => {
    const check = checkBrowserModel(capable, qwen4b, { freeMB: 50_000, downloaded: false });
    assert.equal(check.variant.modelId, "Qwen3.5-4B-q4f16_1-MLC");
    assert.deepEqual([check.problems, check.warnings], [[], []]);
  });

  it("falls back to the 32-bit model without shader-f16, with a warning", () => {
    const check = checkBrowserModel({ ...capable, shaderF16: false }, qwen4b);
    assert.equal(check.variant.modelId, "Qwen3.5-4B-q4f32_1-MLC");
    assert.match(check.warnings.join(), /32-bit/);
  });

  it("blocks missing WebGPU, small buffers and full storage", () => {
    assert.match(checkBrowserModel({ webgpu: false }, qwen2b).problems.join(), /WebGPU/);
    assert.match(checkBrowserModel({ ...capable, maxBufferMiB: 256 }, qwen2b).problems.join(), /256 MiB/);
    assert.match(checkBrowserModel(capable, qwen4b, { freeMB: 1000, downloaded: false }).problems.join(), /storage/);
    assert.deepEqual(checkBrowserModel(capable, qwen4b, { freeMB: 1000, downloaded: true }).problems, []);
  });

  it("warns on Intel graphics, untested GPUs and low memory, leaving the decision to the model test", () => {
    assert.match(checkBrowserModel({ ...capable, vendor: "intel" }, qwen2b).warnings.join(), /Intel/);
    assert.match(checkBrowserModel({ ...capable, vendor: "google" }, qwen2b).warnings.join(), /not been tested/);
    assert.match(checkBrowserModel({ ...capable, ramGiB: 4 }, qwen4b).warnings.join(), /may fail to load/);
    assert.equal(checkBrowserModel({ ...capable, vendor: "intel" }, qwen2b).problems.length, 0);
  });

  it("suggests the lighter model on devices with 8 GB or less", () => {
    assert.equal(recommendBrowserModel(capable).key, "qwen3.5-4b");
    assert.equal(recommendBrowserModel({ ...capable, ramGiB: 8 }).key, "qwen3.5-2b");
    assert.equal(recommendBrowserModel({ ...capable, ramGiB: undefined }).key, "qwen3.5-4b");
  });
});

describe("browser settings", () => {
  it("accepts catalog models and pins the context length", () => {
    assert.deepEqual(parseSettings(JSON.stringify({ path: "browser", modelId: "Qwen3.5-2B-q4f16_1-MLC", contextLength: 999 })), {
      path: "browser",
      modelId: "Qwen3.5-2B-q4f16_1-MLC",
      contextLength: 4096,
    });
    assert.equal(parseSettings(JSON.stringify({ path: "browser", modelId: "SomethingElse-MLC" })), undefined);
  });

  it("reads settings saved before slice 3 as local-server settings", () => {
    const old = { serverKind: "llama.cpp", baseUrl: "http://127.0.0.1:8080/v1", model: "qwen", contextLength: 4096 };
    assert.deepEqual(parseSettings(JSON.stringify(old)), { path: "local-server", ...old });
  });

  it("describes the setup", () => {
    assert.equal(describeSetup({ path: "browser", modelId: "Qwen3.5-4B-q4f16_1-MLC", contextLength: 4096 }), "Qwen3.5-4B in this browser");
    assert.equal(describeSetup({ path: "browser", modelId: "Qwen3.5-2B-q4f32_1-MLC", contextLength: 4096 }), "Qwen3.5-2B (32-bit) in this browser");
    // Qwen3.5-2B's answers need more checking (docs/ai-ml-audit.md §1); 4B's get no caution.
    assert.match(modelCaution({ path: "browser", modelId: "Qwen3.5-2B-q4f16_1-MLC", contextLength: 4096 })!, /wrong more often/);
    assert.match(
      modelCaution({ path: "local-server", serverKind: "llama.cpp", baseUrl: "http://127.0.0.1:8080/v1", model: "Qwen3.5-2B-Q4_K_M.gguf", contextLength: 4096 })!,
      /Qwen3\.5-4B when accuracy matters/,
    );
    assert.equal(modelCaution({ path: "browser", modelId: "Qwen3.5-4B-q4f16_1-MLC", contextLength: 4096 }), undefined);
    assert.equal(
      modelCaution({ path: "local-server", serverKind: "ollama", baseUrl: "http://127.0.0.1:11434/v1", model: "qwen3.5:4b", contextLength: 4096 }),
      undefined,
    );
  });
});

describe("load progress", () => {
  it("turns WebLLM reports into short lines", () => {
    const text = (progress: number, raw: string) => describeLoadProgress({ progress, text: raw }, 2390).text;
    assert.equal(text(0.5, "Fetching param cache[3/86]: 1195MB fetched. 50% completed, 60 secs elapsed."), "Downloading the model: 1,195 of 2,390 MB (50%)");
    assert.match(text(0.2, "Loading model from cache[3/86]: 300MB loaded."), /from this browser's storage \(20%\)/);
    assert.equal(text(1, "Loading GPU shader modules[10/20]: 50% completed"), "Preparing the GPU…");
    assert.equal(text(1, "Finish loading on WebGPU - nvidia"), "Model loaded.");
    assert.equal(text(0, "Start to fetch params"), "Starting the download…");
    assert.equal(text(0, "Starting the model runner"), "Starting the model runner and connecting to the GPU…");
  });

  it("says what may be wrong when loading stalls", () => {
    // Class 1 preview check: the model runner's download was cut off and the page said "Starting…" for over five minutes.
    assert.match(stalledLoadHint("Starting the model runner and connecting to the GPU…"), /Reload the page[\s\S]*VPN, antivirus web protection or a network filter/);
    assert.match(stalledLoadHint("Downloading the model: 214 of 2,390 MB (9%)"), /finished parts are kept/);
    assert.match(stalledLoadHint("Preparing the GPU…"), /several minutes the first time/);
  });

  it("explains a model runner that could not be downloaded", () => {
    const error = Object.assign(new Error("The model runner could not be loaded"), { name: "RunnerLoadError" });
    const settings = { path: "browser" as const, modelId: "Qwen3.5-4B-q4f16_1-MLC", contextLength: 4096 };
    assert.match(describeModelError(error, settings), /^Part of Kovrune, the model runner, could not be downloaded[\s\S]*Reload the page/);
  });
});

describe("WebLLM adapter", () => {
  it("reports a lost GPU plainly and marks the model for reloading", async () => {
    // Class 1 laptop (Intel Iris Xe, Windows): the driver reset with DXGI_ERROR_DEVICE_HUNG during the
    // model test, WebLLM unloaded the model, and the test showed "BindingError: Cannot pass deleted
    // object as a pointer of type GrammarMatcher".
    const { WebLLMModel } = await import("../src/models/webllm.ts");
    const failing = (message: string) => ({
      chat: {
        completions: {
          create: async () => ({
            async *[Symbol.asyncIterator]() {
              throw Object.assign(new Error(message), { name: "BindingError" });
            },
          }),
        },
      },
      interruptGenerate: () => {},
    });
    const settings = { path: "browser" as const, modelId: "Qwen3.5-4B-q4f16_1-MLC", contextLength: 4096 };
    for (const message of ["Cannot pass deleted object as a pointer of type GrammarMatcher", "Model not loaded before trying to complete ChatCompletionRequest."]) {
      const model = new WebLLMModel(failing(message) as never, {} as Worker, { id: "Qwen3.5-4B-q4f16_1-MLC", runtime: "webllm", contextLength: 4096 });
      const error = await (async () => {
        for await (const _ of model.generate({ messages: [], maxTokens: 8 }));
      })().catch((e) => e);
      assert.equal(model.lost, true);
      assert.match(describeModelError(error, settings), /^The GPU stopped responding or ran out of memory, so the model was unloaded\. On Windows[\s\S]*DXGI_ERROR_DEVICE_HUNG/);
    }
    // Other errors pass through unchanged and leave the model usable.
    const other = new WebLLMModel(failing("JSON parse error") as never, {} as Worker, { id: "x", runtime: "webllm", contextLength: 4096 });
    const error = await (async () => {
      for await (const _ of other.generate({ messages: [], maxTokens: 8 }));
    })().catch((e) => e);
    assert.equal(other.lost, false);
    assert.equal(error.message, "JSON parse error");
  });

  it("stops at once, without waiting for the engine's next token", async () => {
    const { WebLLMModel } = await import("../src/models/webllm.ts");
    let interrupted = false;
    const stuck = {
      async *[Symbol.asyncIterator]() {
        await new Promise(() => {}); // a prefill that never finishes
      },
    };
    const engine = {
      chat: { completions: { create: async () => stuck } },
      interruptGenerate: () => {
        interrupted = true;
      },
    };
    const model = new WebLLMModel(engine as never, {} as Worker, { id: "Qwen3.5-2B-q4f16_1-MLC", runtime: "webllm", contextLength: 4096 });
    const controller = new AbortController();
    const run = (async () => {
      for await (const _ of model.generate({ messages: [], maxTokens: 8, signal: controller.signal }));
    })();
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(run, { name: "AbortError" });
    assert.equal(interrupted, true);
  });
});
