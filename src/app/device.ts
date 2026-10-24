// Device advisor (docs/m1-plan.md, decision D1): recommends running the model in
// the browser or on a local server, from what the browser reports about its GPU.
//
// The rules are deliberately conservative. In M0, browser models on integrated
// Intel graphics were either broken (WebGPU) or far too slow (CPU), while a
// native local server on the same laptop met the speed gate.

import { BROWSER_MODELS, type BrowserModel, type BrowserModelVariant } from "../models/catalog.ts";

export type ModelPath = "browser" | "local-server";

export interface DeviceCapabilities {
  webgpu: boolean;
  shaderF16?: boolean;
  /** GPU vendor as reported by WebGPU, e.g. "apple", "nvidia", "amd", "intel". */
  vendor?: string;
  architecture?: string;
  /** Largest single GPU buffer, in MiB; a rough proxy for usable GPU memory. */
  maxBufferMiB?: number;
  /** Approximate device memory in GiB (navigator.deviceMemory; browsers round it and may cap it). */
  ramGiB?: number;
}

export interface Recommendation {
  path: ModelPath;
  reason: string;
}

/** The default browser model needs large GPU buffers; below this, use a local server. */
export const MIN_BUFFER_MIB = 1024;

const CAPABLE_VENDORS = new Set(["apple", "nvidia", "amd"]);

export function recommendPath(caps: DeviceCapabilities): Recommendation {
  if (!caps.webgpu) {
    return { path: "local-server", reason: "This browser does not offer WebGPU, which browser models need." };
  }
  if (caps.shaderF16 === false) {
    return {
      path: "local-server",
      reason: "This GPU lacks 16-bit shader support, so browser models would need their slower 32-bit versions.",
    };
  }
  const vendor = caps.vendor?.toLowerCase() ?? "";
  if (vendor === "intel") {
    return {
      path: "local-server",
      reason: "Integrated Intel graphics: in testing, browser models were too slow or gave broken output on this kind of GPU, while a local server worked well.",
    };
  }
  if (!CAPABLE_VENDORS.has(vendor)) {
    return { path: "local-server", reason: "The browser path has not been tested on this GPU." };
  }
  if (caps.maxBufferMiB !== undefined && caps.maxBufferMiB < MIN_BUFFER_MIB) {
    return { path: "local-server", reason: "This GPU allows only small memory buffers, too small for the default browser model." };
  }
  return { path: "browser", reason: "This GPU supports WebGPU with 16-bit shaders, which the browser models need." };
}

interface GpuAdapterLike {
  info?: { vendor?: string; architecture?: string };
  features: { has(name: string): boolean };
  limits: { maxBufferSize: number };
}

/** Reads capabilities from the browser. Never throws; missing WebGPU is reported as such. */
export async function detectCapabilities(): Promise<DeviceCapabilities> {
  const nav = navigator as Navigator & {
    gpu?: { requestAdapter(): Promise<GpuAdapterLike | null> };
    deviceMemory?: number;
  };
  const ramGiB = nav.deviceMemory;
  try {
    const adapter = await nav.gpu?.requestAdapter();
    if (!adapter) return { webgpu: false, ramGiB };
    return {
      webgpu: true,
      ramGiB,
      shaderF16: adapter.features.has("shader-f16"),
      vendor: adapter.info?.vendor,
      architecture: adapter.info?.architecture,
      maxBufferMiB: Math.floor(adapter.limits.maxBufferSize / 2 ** 20),
    };
  } catch {
    return { webgpu: false, ramGiB };
  }
}

/** The browser model to suggest: the lighter one on devices reporting 8 GB of memory or less. */
export function recommendBrowserModel(caps: DeviceCapabilities): BrowserModel {
  return caps.ramGiB !== undefined && caps.ramGiB <= 8 ? BROWSER_MODELS[1]! : BROWSER_MODELS[0]!;
}

export interface StorageInfo {
  /** Free browser storage for this site, in MB. */
  freeMB: number;
  /** Whether this model is already in the browser's cache. */
  downloaded: boolean;
}

export interface BrowserModelCheck {
  /** The variant to load: 16-bit when the GPU supports it, otherwise the 32-bit fallback. */
  variant: BrowserModelVariant;
  /** Reasons the model cannot run here at all. */
  problems: string[];
  /** Reasons it may not work well; the model test decides. */
  warnings: string[];
}

/** Decimal gigabytes, as Hugging Face and most download dialogs show sizes. */
const gb = (mb: number) => `${(mb / 1000).toFixed(1)} GB`;

/** The compatibility check for running one model in this browser. */
export function checkBrowserModel(caps: DeviceCapabilities, model: BrowserModel, storage?: StorageInfo): BrowserModelCheck {
  const variant = caps.shaderF16 === false ? model.f32 : model.f16;
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!caps.webgpu) {
    problems.push("This browser does not offer WebGPU. Use a recent Chrome or Edge, or a local model server.");
    return { variant, problems, warnings };
  }
  if (caps.maxBufferMiB !== undefined && caps.maxBufferMiB < MIN_BUFFER_MIB) {
    problems.push(`This GPU allows buffers of only ${caps.maxBufferMiB} MiB; the model needs at least ${MIN_BUFFER_MIB} MiB.`);
  }
  if (storage && !storage.downloaded && storage.freeMB < model.downloadMB * 1.1) {
    problems.push(`Not enough browser storage: the download needs ${gb(model.downloadMB)}, and about ${gb(storage.freeMB)} is free.`);
  }
  if (caps.shaderF16 === false) {
    warnings.push(
      `This GPU lacks 16-bit shader support, so Kovrune uses the 32-bit version of the model. It needs more GPU memory (${gb(variant.vramMB)}) and runs slower.`,
    );
  }
  const vendor = caps.vendor?.toLowerCase() ?? "";
  if (vendor === "intel") {
    warnings.push("On integrated Intel graphics, browser models were too slow or gave broken output in testing. The model test will show whether it works here.");
  } else if (!CAPABLE_VENDORS.has(vendor)) {
    warnings.push("The browser path has not been tested on this GPU. The model test will show whether it works here.");
  }
  if (caps.ramGiB !== undefined && caps.ramGiB * 1024 < variant.vramMB + 2048) {
    warnings.push(`This device reports about ${caps.ramGiB} GB of memory, and the model needs about ${gb(variant.vramMB)} of GPU memory. It may fail to load.`);
  }
  return { variant, problems, warnings };
}
