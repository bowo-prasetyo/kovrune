// Replaying a recorded run, to tell without a model which tasks a code change can affect.
//
// A benchmark run records every call the model answered in each task, in order, as the app records a
// question to resume it (src/agent/replay.ts, RecordedCall): a fingerprint of the conversation, the
// reply, why it stopped and its token counts. That covers the agent's steps and the short calls for
// translating search terms and checking the answer. Replaying a task runs a version of the code with a
// model that gives those replies back (ReplayModel), and logs every request the code makes of it: the
// messages, the token limit, the temperature and the JSON schema. Two versions that make the same
// requests, in the same order, give the real model the same input at every step; runs repeat on one
// machine (eval/field/README.md, "Runs repeat on one machine"), so the model would reply the same, and
// the task would end the same. A task whose requests differ has to be run again; one whose requests are
// all the same need not be.
//
// The tasks are run by each version's own runBenchmark, so whatever a change touches before the model's
// input (search, reading, prompts, guards, context fitting, translation) is compared, and nothing in the
// agent loop is re-implemented here. Unlike the app's ReplayingModel, ReplayModel never calls a real
// model, and it compares whole requests, not only the conversation's fingerprint.

import { fingerprint, type RecordedCall } from "../../src/agent/replay.ts";
import type { GenerationChunk, GenerationRequest, LanguageModel, ModelInfo } from "../../src/models/types.ts";

/** The part of a request that reaches the model: what two versions must agree on. */
export interface LoggedRequest {
  messages: GenerationRequest["messages"];
  maxTokens: number;
  temperature?: number;
  responseSchema?: object;
}

function logged(request: GenerationRequest): LoggedRequest {
  return {
    messages: request.messages.map(({ role, content }) => ({ role, content })),
    maxTokens: request.maxTokens,
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.responseSchema !== undefined ? { responseSchema: request.responseSchema } : {}),
  };
}

/** Gives recorded replies back in order, and logs every request. Past the recording, it replies "{}". */
export class ReplayModel implements LanguageModel {
  readonly requests: LoggedRequest[] = [];
  readonly info: ModelInfo;
  private readonly calls: readonly RecordedCall[];
  private readonly constrained: boolean;
  private next = 0;
  constructor(info: ModelInfo, calls: readonly RecordedCall[], constrained: boolean) {
    this.info = info;
    this.calls = calls;
    this.constrained = constrained;
  }
  /** Whether the code asked for more replies than were recorded: then it did not follow the recorded run. */
  get overran(): boolean {
    return this.next > this.calls.length;
  }
  supportsConstrainedDecoding(): boolean {
    return this.constrained;
  }
  async dispose(): Promise<void> {}
  async *generate(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    this.requests.push(logged(request));
    const call = this.calls[this.next++] ?? { input: "", output: "{}" };
    if (call.output) yield { text: call.output, done: false };
    yield { text: "", done: true, ...(call.usage ? { usage: call.usage } : {}), ...(call.finishReason ? { finishReason: call.finishReason } : {}) };
  }
}

/**
 * Whether a replay asked for each recorded call's conversation exactly: as many requests as calls, each
 * with the fingerprint recorded for it. A recording replayed on the code that made it must, or it does not
 * stand for that run (another version of the code made it, or a tool's result changed in between).
 */
export function replaysRecording(requests: LoggedRequest[], calls: readonly RecordedCall[]): boolean {
  return requests.length === calls.length && requests.every((request, i) => fingerprint(request) === calls[i]!.input);
}

/** The index of the first request two versions made differently, or undefined when they made the same ones. */
export function firstDifference(a: LoggedRequest[], b: LoggedRequest[]): number | undefined {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return i;
  }
  return undefined;
}

/** What two versions did with one recorded task. */
export type Verdict =
  | { kind: "same"; requests: number }
  | { kind: "differs"; at: number; requests: [number, number] }
  | { kind: "undecidable"; why: string };
