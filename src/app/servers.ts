// Local model servers the app can connect to (docs/m1-plan.md, decision D2).

export type ServerKind = "llama.cpp" | "ollama" | "other";

export interface ServerPreset {
  kind: ServerKind;
  label: string;
  support: "supported" | "experimental";
  defaultBaseUrl: string;
  /** Request fields that turn off "thinking" for Qwen3-family models on this server. */
  extraBody: Record<string, unknown>;
}

export const SERVER_PRESETS: Record<ServerKind, ServerPreset> = {
  "llama.cpp": {
    kind: "llama.cpp",
    label: "llama.cpp server",
    support: "supported",
    defaultBaseUrl: "http://127.0.0.1:8080/v1",
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
  },
  ollama: {
    kind: "ollama",
    label: "Ollama",
    support: "experimental",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    extraBody: { reasoning_effort: "none" },
  },
  other: {
    kind: "other",
    label: "Other OpenAI-compatible server",
    support: "experimental",
    defaultBaseUrl: "http://127.0.0.1:8000/v1",
    extraBody: {},
  },
};

/** The recommended model for the local-server path, at the revision M0 measured. */
export const RECOMMENDED_GGUF = {
  name: "Qwen3.5-4B (Q4_K_M, 2.6 GB)",
  url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf",
  file: "Qwen3.5-4B-Q4_K_M.gguf",
};

/** A user-facing explanation for a failed connection. */
export function describeConnectionError(error: unknown, baseUrl: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof TypeError || /fetch failed|Failed to fetch|NetworkError/i.test(message)) {
    return `Couldn't reach ${baseUrl}. Check that the server is running at that address and allows requests from this page (llama.cpp allows them by default; Ollama needs this page's address in OLLAMA_ORIGINS).`;
  }
  return message;
}

/** A readable name for a model ID; llama.cpp reports the full file path of the loaded model. */
export function modelLabel(id: string): string {
  return id.split(/[\\/]/).filter(Boolean).at(-1) ?? id;
}
