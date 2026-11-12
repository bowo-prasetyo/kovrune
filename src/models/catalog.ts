// Models the app can run in the browser with WebLLM (docs/m1-plan.md, slice 3).
//
// Each model has a 16-bit variant (q4f16, needs the WebGPU "shader-f16" feature)
// and a 32-bit fallback (q4f32) for GPUs without it. Both download the same
// amount; the fallback needs more GPU memory and runs slower. IDs and memory
// figures come from WebLLM's prebuilt config; tests check they still match.
//
// The last model is experimental: the weakest, for devices with too little memory for the
// others. It is never recommended or selected first (app/device.ts).

export interface BrowserModelVariant {
  /** WebLLM prebuilt model ID. */
  modelId: string;
  /** GPU memory WebLLM reports the model needs at a 4,096-token context. */
  vramMB: number;
}

export interface BrowserModel {
  key: "qwen3.5-4b" | "qwen3.5-2b" | "qwen3.5-0.8b";
  label: string;
  /** Offered with a warning and never recommended: its answers are wrong too often to rely on. */
  experimental?: boolean;
  description: string;
  downloadMB: number;
  f16: BrowserModelVariant;
  f32: BrowserModelVariant;
}

export const BROWSER_MODELS: BrowserModel[] = [
  {
    key: "qwen3.5-4b",
    label: "Qwen3.5-4B",
    description: "Recommended. Answered 86% of the research test questions with verified quotes.",
    downloadMB: 2390,
    f16: { modelId: "Qwen3.5-4B-q4f16_1-MLC", vramMB: 3868 },
    f32: { modelId: "Qwen3.5-4B-q4f32_1-MLC", vramMB: 4680 },
  },
  {
    key: "qwen3.5-2b",
    label: "Qwen3.5-2B",
    description: "Lighter and faster, for GPUs with less memory. Answers fewer questions correctly, so its answers need more checking.",
    downloadMB: 1080,
    f16: { modelId: "Qwen3.5-2B-q4f16_1-MLC", vramMB: 2245 },
    f32: { modelId: "Qwen3.5-2B-q4f32_1-MLC", vramMB: 2592 },
  },
  {
    // docs/m0-benchmark.md, "A smaller model": against Qwen3.5-2B on the same machine, 55% of the
    // field suite against 75%, and 9 of 43 answers labelled "Quotes found" wrong against 4 of 59.
    key: "qwen3.5-0.8b",
    label: "Qwen3.5-0.8B",
    experimental: true,
    description: "Experimental, the weakest model: check every answer. For devices with too little memory for Qwen3.5-2B. In testing, about 1 in 5 of its answers labelled Quotes found were wrong.",
    downloadMB: 443,
    f16: { modelId: "Qwen3.5-0.8B-q4f16_1-MLC", vramMB: 1629 },
    f32: { modelId: "Qwen3.5-0.8B-q4f32_1-MLC", vramMB: 1894 },
  },
];

/** The models offered without a warning, heaviest first. */
export const STANDARD_BROWSER_MODELS = BROWSER_MODELS.filter((m) => !m.experimental);

export const DEFAULT_BROWSER_MODEL = BROWSER_MODELS[0]!;

export function browserModelFor(modelId: string): { model: BrowserModel; variant: BrowserModelVariant } | undefined {
  for (const model of BROWSER_MODELS) {
    for (const variant of [model.f16, model.f32]) if (variant.modelId === modelId) return { model, variant };
  }
  return undefined;
}
