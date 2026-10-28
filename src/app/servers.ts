// Local model servers the app can connect to (docs/m1-plan.md, decision D2).

import { isPublicHttpsPage } from "./build-info.ts";
import { addressSpaceOf, PERMISSION_LABEL } from "./local-access.ts";

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
export function describeConnectionError(
  error: unknown,
  baseUrl: string,
  fromPublicPage = typeof location !== "undefined" && isPublicHttpsPage(location),
): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof TypeError || /fetch failed|Failed to fetch|NetworkError/i.test(message)) {
    const space = addressSpaceOf(baseUrl);
    let text = `Couldn't reach ${baseUrl}. Check that the server is running at that address and allows requests from this page (llama.cpp allows them by default; Ollama needs this page's address in OLLAMA_ORIGINS).`;
    if (space === "local") {
      text += " For a server on another computer, start it with --host 0.0.0.0 and check that its firewall allows the port.";
    }
    if (!fromPublicPage) return text;
    if (space) {
      const where = space === "loopback" ? "a server on this computer" : "a device on your local network";
      return `${text} This page is on the web, so your browser must also allow it to reach ${where}: in Chrome or Edge, click the icon left of the address bar, open Site settings, set "${PERMISSION_LABEL[space]}" to Allow, then reload the page and connect again.`;
    }
    // Chrome lets a public HTTPS page make plain-HTTP requests only to addresses it knows are
    // local before looking them up: private IP addresses and .local names (checked in Chrome 153).
    if (/^http:/i.test(baseUrl)) {
      return `${text} This page is on the web, so your browser reaches a server on another computer only by its IP address (for example http://192.168.1.20:8080/v1) or a name ending in .local.`;
    }
    return text;
  }
  // llama.cpp answers 401 "Invalid API Key" when started with --api-key and the key is missing or wrong.
  if (/returned 40[13]\b/.test(message)) {
    return `${baseUrl} refused the request (${message.match(/returned (40[13])/)![1]}): it needs an API key, or the one entered is wrong. Enter the key the server was started with (llama.cpp: --api-key) under API key.`;
  }
  return message;
}

/** A readable name for a model ID; llama.cpp reports the full file path of the loaded model. */
export function modelLabel(id: string): string {
  return id.split(/[\\/]/).filter(Boolean).at(-1) ?? id;
}

/** The smallest context the research agent runs in (settings.ts checks saved settings against it). */
export const MIN_CONTEXT_LENGTH = 2048;

/**
 * The context length to use once the server has said what it gives each request (llama.cpp's
 * /props, Ollama's /api/ps or the model's num_ctx), with a note when that differs from the one typed.
 * The agent fits its conversation into the context it is told; told more than the server has, a long
 * question fails partway through on llama.cpp, and on Ollama loses its start without a word: the
 * system prompt, the question, or the documents an answer quotes.
 */
export function contextFromServer(
  reported: number | undefined,
  typed: number,
  kind: ServerKind = "llama.cpp",
): { contextLength: number; note?: string; tooSmall?: boolean } {
  if (kind === "ollama") return contextFromOllama(reported, typed);
  if (reported === undefined || reported === typed) return { contextLength: typed };
  if (reported < MIN_CONTEXT_LENGTH) {
    return {
      contextLength: reported,
      tooSmall: true,
      note: `The server gives each request only ${reported} tokens of context; Kovrune needs at least ${MIN_CONTEXT_LENGTH}. Restart it with -c 4096 -np 1 (-np 1 keeps the whole context for one request).`,
    };
  }
  return {
    contextLength: reported,
    note:
      `The server gives each request ${reported} tokens of context, so the context length is set to that.` +
      (reported < typed ? " To give it more, restart the server with a larger -c, and -np 1 so that one request gets all of it." : ""),
  };
}

/** How to give a model more context on Ollama: the server's default, for every model without its own num_ctx. */
const OLLAMA_CONTEXT_ADVICE = "start Ollama with OLLAMA_CONTEXT_LENGTH=4096 or more (for example OLLAMA_CONTEXT_LENGTH=8192 ollama serve), then test again";

/**
 * contextFromServer for Ollama (ollamaContextLength). Unlike llama.cpp, Ollama does not refuse a prompt
 * that is too long: it cuts it without saying so. So when Ollama does not say what context it gives
 * the model, the note warns about that rather than staying silent.
 */
function contextFromOllama(reported: number | undefined, typed: number): { contextLength: number; note?: string; tooSmall?: boolean } {
  if (reported === undefined) {
    return {
      contextLength: typed,
      note: `Ollama didn't say how much context it gives this model. It cuts prompts longer than that without saying so, which can leave out the documents an answer quotes. To be sure it has ${typed} tokens, ${OLLAMA_CONTEXT_ADVICE}.`,
    };
  }
  if (reported === typed) return { contextLength: typed };
  if (reported < MIN_CONTEXT_LENGTH) {
    return {
      contextLength: reported,
      tooSmall: true,
      note: `Ollama runs this model with only ${reported} tokens of context; Kovrune needs at least ${MIN_CONTEXT_LENGTH}. To give it more, ${OLLAMA_CONTEXT_ADVICE}.`,
    };
  }
  return {
    contextLength: reported,
    note:
      `Ollama runs this model with ${reported} tokens of context, so the context length is set to that.` +
      (reported < typed ? ` To give it more, ${OLLAMA_CONTEXT_ADVICE}.` : ""),
  };
}
