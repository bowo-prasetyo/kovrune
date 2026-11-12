// Device advisor (docs/m1-plan.md, decision D1): recommends running the model in
// the browser or on a local server, from what the browser reports about its GPU.
//
// The rules are deliberately conservative. In M0, browser models on integrated
// Intel graphics were either broken (WebGPU) or far too slow (CPU), while a
// native local server on the same laptop met the speed gate.

import { BROWSER_MODELS, STANDARD_BROWSER_MODELS, type BrowserModel, type BrowserModelVariant } from "../models/catalog.ts";

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

/** Decimal gigabytes, as Hugging Face and most download dialogs show sizes. */
const gb = (mb: number) => `${(mb / 1000).toFixed(1)} GB`;

/**
 * Whether the device reports enough memory for a model variant: its GPU memory plus about 2 GB
 * for the system and the browser. Phones and integrated graphics share one memory. Unknown
 * memory counts as enough.
 */
export function memoryFits(caps: DeviceCapabilities, variant: BrowserModelVariant): boolean {
  return caps.ramGiB === undefined || caps.ramGiB * 1024 >= variant.vramMB + 2048;
}

const variantFor = (caps: DeviceCapabilities, model: BrowserModel) => (caps.shaderF16 === false ? model.f32 : model.f16);

/** The variant of the lightest standard (not experimental) browser model this device would load. */
function lightestVariant(caps: DeviceCapabilities): BrowserModelVariant {
  return variantFor(caps, STANDARD_BROWSER_MODELS[STANDARD_BROWSER_MODELS.length - 1]!);
}

/**
 * Whether the device reports too little memory for even the lightest standard browser model. On an
 * Android phone reporting 4 GB, Qwen3.5-2B (2.2 GB of GPU memory) always failed near the end
 * of loading.
 */
export function tooLittleMemory(caps: DeviceCapabilities): boolean {
  return !memoryFits(caps, lightestVariant(caps));
}

/**
 * The experimental model to mention on a device with too little memory for the standard ones,
 * when it fits by memoryFits; undefined otherwise. It is never selected first or shown as
 * recommended. Fitting by that rule is no promise: on an Android phone reporting 4 GB (Arm Mali),
 * Qwen3.5-0.8B loaded, then the GPU connection was lost at its first answer, every time.
 */
export function experimentalFallback(caps: DeviceCapabilities): BrowserModel | undefined {
  if (!tooLittleMemory(caps)) return undefined;
  return BROWSER_MODELS.find((m) => m.experimental && memoryFits(caps, variantFor(caps, m)));
}

/** Shown when an experimental model is chosen, and in the user guide's words. */
export function experimentalWarning(model: BrowserModel): string {
  return `${model.label} is experimental and the weakest model: it answers fewer questions correctly than Qwen3.5-2B, and in testing about 1 in 5 of its answers labelled Quotes found were wrong. Check every answer against its quoted passages. A model server on another computer gives better answers.`;
}

/** What to do on a device with too little memory for the browser models. */
export const OTHER_COMPUTER_ADVICE = "To use Kovrune from this device, run the model on a computer on the same network:";
export const OTHER_COMPUTER_SECTION = "Use a model server on another computer";
export const OTHER_COMPUTER_HELP = "#use-a-model-server-on-another-computer";

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
  if (tooLittleMemory(caps)) {
    const fallback = experimentalFallback(caps);
    return {
      path: "local-server",
      reason: `This device reports about ${caps.ramGiB} GB of memory, and even the lighter browser model needs about ${gb(lightestVariant(caps).vramMB)} of GPU memory, so it would likely fail to load. A model server on another computer on your network works from this device (${OTHER_COMPUTER_SECTION}, in the user guide).${fallback ? ` The browser path also offers the experimental ${fallback.label}, which needs about ${gb(variantFor(caps, fallback).vramMB)}. It may not run either (on a 4 GB Android phone it loaded, then the GPU stopped at its first answer), and its answers are wrong more often: check every one.` : ""}`,
    };
  }
  const vendor = caps.vendor?.toLowerCase() ?? "";
  if (vendor === "intel") {
    return {
      path: "local-server",
      // Measured on an Intel Iris Xe laptop (16 GB), docs/m1-plan.md slice 3.
      reason: "Integrated Intel graphics: in testing, browser models worked but ran slowly on this kind of GPU (Qwen3.5-4B at about 3 tokens/s, against 5.5 with a local server), and the GPU sometimes stopped responding under the larger model.",
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

/**
 * The browser model to select first: the lighter one on devices reporting 8 GB of memory or less.
 * It is shown as recommended only when it fits (tooLittleMemory).
 */
export function recommendBrowserModel(caps: DeviceCapabilities): BrowserModel {
  return caps.ramGiB !== undefined && caps.ramGiB <= 8 ? STANDARD_BROWSER_MODELS[1]! : STANDARD_BROWSER_MODELS[0]!;
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


/** The compatibility check for running one model in this browser. */
export function checkBrowserModel(caps: DeviceCapabilities, model: BrowserModel, storage?: StorageInfo): BrowserModelCheck {
  const variant = variantFor(caps, model);
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
    warnings.push(
      "On integrated Intel graphics, browser models ran slowly in testing (Qwen3.5-4B at about 3 tokens/s, so a question can take up to half an hour), and the GPU sometimes stopped responding under the larger model. The model test will show the speed here.",
    );
  } else if (!CAPABLE_VENDORS.has(vendor)) {
    warnings.push("The browser path has not been tested on this GPU. The model test will show whether it works here.");
  }
  if (!memoryFits(caps, variant)) {
    warnings.push(
      `This device reports about ${caps.ramGiB} GB of memory, and the model needs about ${gb(variant.vramMB)} of GPU memory. It may fail to load, near the end; on a phone the page may just reload.`,
    );
  }
  return { variant, problems, warnings };
}
