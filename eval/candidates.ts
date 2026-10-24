// Candidate models for M0. Sizes and memory figures come from each runtime's own
// metadata (WebLLM prebuilt config, Hugging Face file listings) as of October 2026.

export interface WebLLMCandidate {
  runtime: "webllm";
  modelId: string;
  vramMB: number;
  license: string;
}

export interface WllamaCandidate {
  runtime: "wllama";
  repo: string;
  revision: string;
  file: string;
  sizeMB: number;
  license: string;
  /** Too small to be a real candidate; used to check the harness end to end. */
  smokeTestOnly?: boolean;
}

export const webllmCandidates: WebLLMCandidate[] = [
  { runtime: "webllm", modelId: "Qwen3.5-2B-q4f16_1-MLC", vramMB: 2245, license: "apache-2.0" },
  { runtime: "webllm", modelId: "Llama-3.2-3B-Instruct-q4f16_1-MLC", vramMB: 2264, license: "llama3.2" },
  { runtime: "webllm", modelId: "Qwen3-4B-q4f16_1-MLC", vramMB: 3432, license: "apache-2.0" },
  { runtime: "webllm", modelId: "Phi-3.5-mini-instruct-q4f16_1-MLC", vramMB: 3672, license: "mit" },
  { runtime: "webllm", modelId: "Qwen3.5-4B-q4f16_1-MLC", vramMB: 3868, license: "apache-2.0" },
];

export const wllamaCandidates: WllamaCandidate[] = [
  {
    runtime: "wllama",
    repo: "unsloth/Qwen3.5-2B-GGUF",
    revision: "f6d5376be1edb4d416d56da11e5397a961aca8ae",
    file: "Qwen3.5-2B-Q4_K_M.gguf",
    sizeMB: 1222,
    license: "apache-2.0",
  },
  {
    runtime: "wllama",
    repo: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    revision: "5ab33fa94d1d04e903623ae72c95d1696f09f9e8",
    file: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    sizeMB: 1926,
    license: "llama3.2",
  },
  {
    runtime: "wllama",
    repo: "unsloth/Qwen3.5-0.8B-GGUF",
    revision: "6ab461498e2023f6e3c1baea90a8f0fe38ab64d0",
    file: "Qwen3.5-0.8B-Q4_K_M.gguf",
    sizeMB: 508,
    license: "apache-2.0",
    smokeTestOnly: true,
  },
];
