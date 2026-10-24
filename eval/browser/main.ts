import wllamaWasm from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import type { LanguageModel } from "../../src/models/types.ts";
import { webllmCandidates, wllamaCandidates } from "../candidates.ts";
import { runBenchmark, type BenchmarkConfig, type Mode, type Report } from "../harness/benchmark.ts";
import { formatReport } from "../harness/format.ts";
import { BrowserCodeRunner } from "../harness/sandbox.ts";
import type { SuiteName } from "../harness/suites.ts";

export interface BrowserRunOptions {
  runtime: "webllm" | "wllama";
  /** WebLLM model ID, or "repo@revision/file" for wllama. */
  model: string;
  contextLength: number;
  gpuLayers?: number;
  hardwareClass: string;
  notes?: string;
  config: BenchmarkConfig;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const log = (line: string) => {
  const el = $("log");
  el.textContent += `${line}\n`;
  el.scrollTop = el.scrollHeight;
};

interface GpuAdapterLike {
  info: { vendor: string; architecture: string; device: string; description: string };
  features: { has(name: string): boolean };
}

async function detectHardware(): Promise<Record<string, unknown>> {
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: { requestAdapter(): Promise<GpuAdapterLike | null> } };
  let gpu: Record<string, unknown> = { available: false };
  try {
    const adapter = await nav.gpu?.requestAdapter();
    if (adapter) {
      const info = adapter.info;
      gpu = {
        available: true,
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description,
        shaderF16: adapter.features.has("shader-f16"),
      };
    }
  } catch (error) {
    gpu = { available: false, error: String(error) };
  }
  return {
    userAgent: navigator.userAgent,
    cpuCores: navigator.hardwareConcurrency,
    deviceMemoryGb: nav.deviceMemory,
    crossOriginIsolated: globalThis.crossOriginIsolated,
    webgpu: gpu,
  };
}

async function loadModel(options: BrowserRunOptions): Promise<LanguageModel> {
  // Runtimes are loaded on demand; each is several megabytes.
  if (options.runtime === "webllm") {
    const { loadWebLLMModel } = await import("../../src/models/webllm.ts");
    return loadWebLLMModel({
      modelId: options.model,
      contextLength: options.contextLength,
      onProgress: (report) => log(`[load] ${report.text}`),
    });
  }
  const match = /^([^@]+)@([0-9a-f]{40})\/(.+)$/.exec(options.model);
  if (!match) throw new Error('wllama models are given as "owner/repo@<commit sha>/file.gguf"');
  let lastPercent = -1;
  const { loadWllamaModel } = await import("../../src/models/wllama.ts");
  return loadWllamaModel({
    repo: match[1]!,
    revision: match[2]!,
    file: match[3]!,
    assets: { default: wllamaWasm },
    contextLength: options.contextLength,
    gpuLayers: options.gpuLayers,
    onProgress: ({ loaded, total }) => {
      const percent = Math.floor((loaded / total) * 100);
      if (percent !== lastPercent && percent % 10 === 0) log(`[load] ${percent}% of ${Math.round(total / 2 ** 20)} MiB`);
      lastPercent = percent;
    },
  });
}

let controller: AbortController | undefined;

/** Entry point for both the form and automated runs (window.kovruneBench.run). */
async function run(options: BrowserRunOptions): Promise<Report> {
  controller = new AbortController();
  const hardware = await detectHardware();
  log(`Loading ${options.model} with ${options.runtime}…`);
  const loadStarted = performance.now();
  const model = await loadModel(options);
  const loadSeconds = Math.round((performance.now() - loadStarted) / 100) / 10;
  log(`Loaded in ${loadSeconds} s.`);
  try {
    const report = await runBenchmark({
      model,
      runner: new BrowserCodeRunner(),
      config: options.config,
      signal: controller.signal,
      environment: {
        runtime: options.runtime,
        modelId: options.model,
        contextLength: options.contextLength,
        hardwareClass: options.hardwareClass,
        hardware: { ...hardware, loadSeconds, gpuLayers: options.gpuLayers ?? "all" },
        notes: options.notes,
      },
      onResult: (r, done, total) =>
        log(`[${done}/${total}] ${r.mode} ${r.taskId}: ${r.passed ? "PASS" : "FAIL"} (${(r.wallMs / 1000).toFixed(1)} s, ${r.validCalls}/${r.calls} valid)`),
    });
    $("summary").textContent = formatReport(report);
    return report;
  } finally {
    await model.dispose();
  }
}

function populateCandidates() {
  const runtime = $<HTMLSelectElement>("runtime").value;
  const select = $<HTMLSelectElement>("candidate");
  select.innerHTML = "";
  const options =
    runtime === "webllm"
      ? webllmCandidates.map((c) => ({ value: c.modelId, label: `${c.modelId} (~${(c.vramMB / 1024).toFixed(1)} GB VRAM)` }))
      : wllamaCandidates.map((c) => ({
          value: `${c.repo}@${c.revision}/${c.file}`,
          label: `${c.repo} ${c.file} (${(c.sizeMB / 1024).toFixed(1)} GB)${c.smokeTestOnly ? " [smoke test only]" : ""}`,
        }));
  for (const option of options) select.add(new Option(option.label, option.value));
  $("gpu-layers-label").hidden = runtime !== "wllama";
}

function readForm(): BrowserRunOptions {
  const checked = (name: string) =>
    [...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((el) => el.value);
  const gpuLayers = $<HTMLInputElement>("gpu-layers").value;
  const tasks = $<HTMLInputElement>("tasks").value.trim();
  return {
    runtime: $<HTMLSelectElement>("runtime").value as BrowserRunOptions["runtime"],
    model: $<HTMLSelectElement>("candidate").value,
    contextLength: Number($<HTMLInputElement>("context").value),
    gpuLayers: gpuLayers === "" ? undefined : Number(gpuLayers),
    hardwareClass: $<HTMLSelectElement>("hardware-class").value,
    notes: $<HTMLInputElement>("notes").value || undefined,
    config: {
      suites: checked("suite") as SuiteName[],
      modes: checked("mode") as Mode[],
      taskIds: tasks ? tasks.split(",").map((t) => t.trim()) : undefined,
    },
  };
}

function download(report: Report) {
  const name = `${report.environment.modelId.replace(/[^a-z0-9.-]+/gi, "_")}-class${report.environment.hardwareClass}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

let lastReport: Report | undefined;

$("runtime").addEventListener("change", populateCandidates);
$("run").addEventListener("click", async () => {
  $<HTMLButtonElement>("run").disabled = true;
  $<HTMLButtonElement>("stop").disabled = false;
  $("log").textContent = "";
  try {
    lastReport = await run(readForm());
    $<HTMLButtonElement>("download").disabled = false;
  } catch (error) {
    log(`Error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    $<HTMLButtonElement>("run").disabled = false;
    $<HTMLButtonElement>("stop").disabled = true;
  }
});
$("stop").addEventListener("click", () => controller?.abort());
$("download").addEventListener("click", () => lastReport && download(lastReport));

populateCandidates();
detectHardware().then((hw) => ($("environment").textContent = JSON.stringify(hw, null, 2)));

(window as unknown as { kovruneBench: unknown }).kovruneBench = { run, detectHardware };
