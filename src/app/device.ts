// Device advisor (docs/m1-plan.md, decision D1): recommends running the model in
// the browser or on a local server, from what the browser reports about its GPU.
//
// The rules are deliberately conservative. In M0, browser models on integrated
// Intel graphics were either broken (WebGPU) or far too slow (CPU), while a
// native local server on the same laptop met the speed gate.

export type ModelPath = "browser" | "local-server";

export interface DeviceCapabilities {
  webgpu: boolean;
  shaderF16?: boolean;
  /** GPU vendor as reported by WebGPU, e.g. "apple", "nvidia", "amd", "intel". */
  vendor?: string;
  architecture?: string;
  /** Largest single GPU buffer, in MiB; a rough proxy for usable GPU memory. */
  maxBufferMiB?: number;
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
    return { path: "local-server", reason: "This GPU lacks 16-bit shader support, which the browser models need." };
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
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<GpuAdapterLike | null> } }).gpu;
  try {
    const adapter = await gpu?.requestAdapter();
    if (!adapter) return { webgpu: false };
    return {
      webgpu: true,
      shaderF16: adapter.features.has("shader-f16"),
      vendor: adapter.info?.vendor,
      architecture: adapter.info?.architecture,
      maxBufferMiB: Math.floor(adapter.limits.maxBufferSize / 2 ** 20),
    };
  } catch {
    return { webgpu: false };
  }
}
