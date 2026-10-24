// Models the app can run in the browser with WebLLM (docs/m1-plan.md, slice 3).
//
// Each model has a 16-bit variant (q4f16, needs the WebGPU "shader-f16" feature)
// and a 32-bit fallback (q4f32) for GPUs without it. Both download the same
// amount; the fallback needs more GPU memory and runs slower. IDs and memory
// figures come from WebLLM's prebuilt config; tests check they still match.

export interface BrowserModelVariant {
  /** WebLLM prebuilt model ID. */
  modelId: string;
  /** GPU memory WebLLM reports the model needs at a 4,096-token context. */
  vramMB: number;
}

export interface BrowserModel {
  key: "qwen3.5-4b" | "qwen3.5-2b";
  label: string;
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
    description: "Lighter and faster, for GPUs with less memory. Answers fewer questions correctly.",
    downloadMB: 1080,
    f16: { modelId: "Qwen3.5-2B-q4f16_1-MLC", vramMB: 2245 },
    f32: { modelId: "Qwen3.5-2B-q4f32_1-MLC", vramMB: 2592 },
  },
];

export const DEFAULT_BROWSER_MODEL = BROWSER_MODELS[0]!;

export function browserModelFor(modelId: string): { model: BrowserModel; variant: BrowserModelVariant } | undefined {
  for (const model of BROWSER_MODELS) {
    for (const variant of [model.f16, model.f32]) if (variant.modelId === modelId) return { model, variant };
  }
  return undefined;
}
