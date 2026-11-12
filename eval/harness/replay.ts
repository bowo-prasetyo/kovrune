// Record and replay a model's replies, to tell without a model which tasks a code change can affect.
//
// A benchmark run records every reply the model gave in each task, in order: the agent's steps, and the
// short calls for translating search terms, reviewing the answer, the cross-check and the completeness
// check (RecordingModel). Replaying a task runs a version of the code with a model that gives those
// replies back (ReplayModel), and logs every request the code makes of it: the messages, the token limit,
// the temperature and the JSON schema. Two versions that make the same requests, in the same order, give
// the real model the same input at every step; runs repeat on one machine (eval/field/README.md, "Runs
// repeat on one machine"), so the model would reply the same, and the task would end the same. A task
// whose requests differ has to be run again; one whose requests are all the same need not be.
//
// The tasks are run by each version's own runBenchmark, so whatever a change touches before the model's
// input (search, reading, prompts, guards, context fitting, translation) is compared, and nothing in the
// agent loop is re-implemented here.

import type { GenerationChunk, GenerationRequest, LanguageModel, ModelInfo } from "../../src/models/types.ts";

/** One reply as the model gave it: what a replay needs to give it back. */
export interface RecordedReply {
  text: string;
  usage?: GenerationChunk["usage"];
  finishReason?: string;
}

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

/** Passes requests to a model, and keeps each reply it gives. */
export class RecordingModel implements LanguageModel {
  readonly replies: RecordedReply[] = [];
  private readonly model: LanguageModel;
  constructor(model: LanguageModel) {
    this.model = model;
  }
  get info(): ModelInfo {
    return this.model.info;
  }
  supportsConstrainedDecoding(): boolean {
    return this.model.supportsConstrainedDecoding();
  }
  dispose(): Promise<void> {
    return this.model.dispose();
  }
  async *generate(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    const reply: RecordedReply = { text: "" };
    // Kept as it streams, so a reply cut short by an error or an abort is recorded as far as it came.
    this.replies.push(reply);
    for await (const chunk of this.model.generate(request)) {
      reply.text += chunk.text;
      if (chunk.usage) reply.usage = chunk.usage;
      if (chunk.finishReason) reply.finishReason = chunk.finishReason;
      yield chunk;
    }
  }
}

/** Gives recorded replies back in order, and logs every request. Past the recording, it replies "{}". */
export class ReplayModel implements LanguageModel {
  readonly requests: LoggedRequest[] = [];
  readonly info: ModelInfo;
  private readonly replies: RecordedReply[];
  private readonly constrained: boolean;
  private next = 0;
  constructor(info: ModelInfo, replies: RecordedReply[], constrained: boolean) {
    this.info = info;
    this.replies = replies;
    this.constrained = constrained;
  }
  /** Whether the code asked for more replies than were recorded: then it did not follow the recorded run. */
  get overran(): boolean {
    return this.next > this.replies.length;
  }
  supportsConstrainedDecoding(): boolean {
    return this.constrained;
  }
  async dispose(): Promise<void> {}
  async *generate(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    this.requests.push(logged(request));
    const reply = this.replies[this.next++] ?? { text: "{}" };
    if (reply.text) yield { text: reply.text, done: false };
    yield { text: "", done: true, ...(reply.usage ? { usage: reply.usage } : {}), ...(reply.finishReason ? { finishReason: reply.finishReason } : {}) };
  }
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
