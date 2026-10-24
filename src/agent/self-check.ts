// A two-step check run after loading a model and before the benchmark.
//
// It catches a broken runtime in about a minute instead of after hours of
// failed tasks:
// 1. The model must produce a valid action. This also warms the runtime up,
//    so the first call's start-up cost does not distort the speed estimate.
// 2. Given a search result that names the right document, the model must read
//    it or answer, not search again. This catches servers that mishandle
//    multi-turn tool conversations (seen with Ollama 0.40.10 and Qwen3.5 with
//    thinking off), where every call repeats the first search.
// Speed is measured on the second, warm call.

import type { ChatMessage, LanguageModel } from "../models/types.ts";
import { createResearchTools, RESEARCH_SYSTEM } from "../tools/research.ts";
import { DocumentIndex, type SourceDocument } from "../tools/search.ts";
import { actionJsonSchema, actionSchema, callForAction, OBSERVATION_PREFIX, systemPrompt } from "./agent.ts";

export interface SelfCheckResult {
  passed: boolean;
  constrained: boolean;
  /**
   * The step that failed: no valid first action, no valid second action, or a
   * valid second action that ignored the tool result.
   */
  failedStep?: "first-action" | "second-action" | "uses-tool-result";
  /** Start of the raw model output from the failing step, or from step 2 when passed. */
  output: string;
  error?: string;
  seconds: number;
  /** Measured on the warm second call; 0 when step 1 failed. */
  decodeTokensPerSecond: number;
  /** Worst case for one research task: every call uses its full token budget. */
  maxResearchTaskMinutes: number;
}

const RESEARCH_MAX_CALLS = 8;
const RESEARCH_MAX_TOKENS = 256;
const SELF_CHECK_QUERY = "LumenDB license";

/**
 * Built-in documents for the check, so it works before the user adds any.
 * They are fictional; the question must be answered from them, not from memory.
 */
export const SELF_CHECK_DOCUMENTS: SourceDocument[] = [
  {
    id: "lumen-overview",
    title: "LumenDB project overview",
    text: "LumenDB is an embedded key-value store written in Rust. It has been maintained by the Tessel Foundation since 2022. LumenDB was released under the Apache-2.0 license until version 2.x. Starting with version 3.0, released in March 2024, the project is licensed under the Mozilla Public License 2.0 (MPL-2.0).",
  },
  {
    id: "cobble-overview",
    title: "Cobble embedded store overview",
    text: "Cobble is an embedded key-value store written in Go and developed by Harrow Labs. Cobble is released under the Business Source License 1.1, and each release converts to the Apache-2.0 license four years after its release date.",
  },
];

export interface SelfCheckOptions {
  signal?: AbortSignal;
  /** Documents to search in step 2. The benchmark passes its own corpus; the app uses the built-in sample. */
  documents?: SourceDocument[];
  /** Called as each step starts, for progress display. */
  onStep?: (step: 1 | 2) => void;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function runSelfCheck(model: LanguageModel, options: SelfCheckOptions = {}): Promise<SelfCheckResult> {
  const { signal } = options;
  const researchTools = createResearchTools(new DocumentIndex(options.documents ?? SELF_CHECK_DOCUMENTS));
  const constrained = model.supportsConstrainedDecoding();
  const schema = actionSchema(researchTools);
  const responseSchema = constrained ? actionJsonSchema(researchTools) : undefined;
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(RESEARCH_SYSTEM, researchTools) },
    { role: "user", content: "Which license does LumenDB use? Start by searching the documents." },
  ];

  options.onStep?.(1);
  const first = await callForAction({ model, messages, schema, responseSchema, maxTokens: 64, signal });
  if (!first.record.valid) {
    return {
      passed: false,
      constrained,
      failedStep: "first-action",
      output: first.text.slice(0, 200),
      error: first.record.error,
      seconds: round1(first.record.totalMs / 1000),
      decodeTokensPerSecond: 0,
      maxResearchTaskMinutes: 0,
    };
  }

  // Continue from a fixed search, whatever the model chose, so step 2 is the same for every model.
  const search = researchTools.find((t) => t.name === "search")!;
  messages.push(
    { role: "assistant", content: JSON.stringify({ tool: "search", args: { query: SELF_CHECK_QUERY } }) },
    { role: "user", content: `${OBSERVATION_PREFIX}${await search.execute!({ query: SELF_CHECK_QUERY })}` },
  );
  options.onStep?.(2);
  const second = await callForAction({ model, messages, schema, responseSchema, maxTokens: 96, signal });
  const record = second.record;
  const usesResult = record.valid && (record.tool === "read" || record.tool === "final_answer");
  const failedStep = usesResult ? undefined : record.valid ? "uses-tool-result" : "second-action";

  const decodeMs = Math.max(record.totalMs - record.ttftMs, 1);
  const decodeTokensPerSecond = (record.completionTokens / decodeMs) * 1000;
  const secondsPerCall = record.ttftMs / 1000 + RESEARCH_MAX_TOKENS / Math.max(decodeTokensPerSecond, 0.01);
  return {
    passed: usesResult,
    constrained,
    failedStep,
    output: second.text.slice(0, 200),
    error: usesResult
      ? undefined
      : (record.error ?? `searched again (${record.tool} ${JSON.stringify(record.args)}) instead of using the search result`),
    seconds: round1((first.record.totalMs + record.totalMs) / 1000),
    decodeTokensPerSecond: round1(decodeTokensPerSecond),
    maxResearchTaskMinutes: round1((RESEARCH_MAX_CALLS * secondsPerCall) / 60),
  };
}

/** Human-readable summary lines for logs. */
export function describeSelfCheck(result: SelfCheckResult): string[] {
  const lines = [
    `Self-check ${result.passed ? "passed" : "FAILED"} in ${result.seconds} s (${result.constrained ? "constrained" : "unconstrained"} decoding).`,
  ];
  if (result.failedStep !== "first-action") {
    lines.push(`Speed: ${result.decodeTokensPerSecond} tokens/s. A research task can take up to ${result.maxResearchTaskMinutes} min at this speed.`);
  }
  if (!result.passed) {
    lines.push(`Error: ${result.error}`);
    lines.push(`Model output: ${JSON.stringify(result.output)}`);
    if (result.failedStep === "uses-tool-result") {
      lines.push(
        "The model is not acting on tool results, so tasks will loop until the call limit. If you are using Ollama, try llama.cpp server with the same model file (see docs/m0-benchmark.md).",
      );
    } else {
      lines.push(
        "The reply was invalid or cut off. If this is a thinking model (such as Qwen3 or Qwen3.5), make sure thinking is turned off (see docs/m0-benchmark.md).",
      );
    }
  }
  return lines;
}
