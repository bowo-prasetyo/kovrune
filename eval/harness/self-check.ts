// A one-call check run after loading a model and before the benchmark.
//
// It catches a broken runtime (for example WebGPU producing garbage on some
// integrated GPUs) in about a minute instead of after hours of failed tasks,
// and measures speed so the user can see how long a full run would take.

import type { LanguageModel } from "../../src/models/types.ts";
import { actionJsonSchema, actionSchema, callForAction, systemPrompt } from "./agent.ts";
import { RESEARCH_SYSTEM, researchTools } from "./suites.ts";

export interface SelfCheckResult {
  passed: boolean;
  constrained: boolean;
  /** Start of the raw model output. */
  output: string;
  error?: string;
  seconds: number;
  decodeTokensPerSecond: number;
  /** Worst case for one research task: every call uses its full token budget. */
  maxResearchTaskMinutes: number;
}

const RESEARCH_MAX_CALLS = 8;
const RESEARCH_MAX_TOKENS = 256;

export async function runSelfCheck(model: LanguageModel, signal?: AbortSignal): Promise<SelfCheckResult> {
  const constrained = model.supportsConstrainedDecoding();
  const { record, text } = await callForAction({
    model,
    messages: [
      { role: "system", content: systemPrompt(RESEARCH_SYSTEM, researchTools) },
      { role: "user", content: "Which license does LumenDB use? Start by searching the documents." },
    ],
    schema: actionSchema(researchTools),
    responseSchema: constrained ? actionJsonSchema(researchTools) : undefined,
    maxTokens: 64,
    signal,
  });
  const decodeMs = Math.max(record.totalMs - record.ttftMs, 1);
  const decodeTokensPerSecond = (record.completionTokens / decodeMs) * 1000;
  const secondsPerCall = record.ttftMs / 1000 + RESEARCH_MAX_TOKENS / Math.max(decodeTokensPerSecond, 0.01);
  return {
    passed: record.valid,
    constrained,
    output: text.slice(0, 200),
    error: record.error,
    seconds: Math.round(record.totalMs / 100) / 10,
    decodeTokensPerSecond: Math.round(decodeTokensPerSecond * 10) / 10,
    maxResearchTaskMinutes: Math.round((RESEARCH_MAX_CALLS * secondsPerCall) / 6) / 10,
  };
}

/** Human-readable summary lines for logs. */
export function describeSelfCheck(result: SelfCheckResult): string[] {
  const lines = [
    `Self-check ${result.passed ? "passed" : "FAILED"} in ${result.seconds} s (${result.constrained ? "constrained" : "unconstrained"} decoding).`,
    `Speed: ${result.decodeTokensPerSecond} tokens/s. A research task can take up to ${result.maxResearchTaskMinutes} min at this speed.`,
  ];
  if (!result.passed) {
    lines.push(`Error: ${result.error}`);
    lines.push(`Model output: ${JSON.stringify(result.output)}`);
  }
  return lines;
}
