// Resuming an interrupted research task (M2 slice 2).
//
// The agent and its tools keep their state in memory: what was searched, what is
// unread, the open-source documents fetched. Rather than saving all of that, a task
// saves the model's replies as it goes. To resume, the task runs again from the start
// with the saved replies standing in for the model: the tools run again (instantly for
// the user's documents, a few seconds for Wikipedia or OpenAlex), which rebuilds their
// state, and the real model takes over at the first step that has no saved reply.
//
// With each reply goes a fingerprint of the conversation the model saw. If a tool
// result differs on resume, the conversation differs from that step on, so the saved
// replies would answer a conversation that no longer exists: replay stops there and the
// real model continues.

import type { GenerationChunk, GenerationRequest, LanguageModel, ModelInfo } from "../models/types.ts";

/** One model call of a task: a fingerprint of what the model saw, and its whole reply. */
export interface RecordedCall {
  input: string;
  output: string;
}

/** FNV-1a over the conversation, as 8 hex digits: enough to tell two conversations apart, small to store. */
export function fingerprint(request: Pick<GenerationRequest, "messages">): string {
  let hash = 0x811c9dc5;
  const text = JSON.stringify(request.messages);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Wraps a model: answers from `replay` while the conversation matches it, then calls the
 * real model. Every finished call, replayed or not, is reported through `onRecord`, with
 * the list of calls so far, for saving.
 */
export class ReplayingModel implements LanguageModel {
  readonly info: ModelInfo;
  private readonly inner: LanguageModel;
  private readonly replay: readonly RecordedCall[];
  private readonly onRecord?: (calls: RecordedCall[]) => void;
  private readonly calls: RecordedCall[] = [];
  private replaying: boolean;
  /** How many calls were answered from the saved replies. */
  replayed = 0;

  constructor(inner: LanguageModel, options: { replay?: readonly RecordedCall[]; onRecord?: (calls: RecordedCall[]) => void } = {}) {
    this.inner = inner;
    this.info = inner.info;
    this.replay = options.replay ?? [];
    this.onRecord = options.onRecord;
    this.replaying = this.replay.length > 0;
  }

  supportsConstrainedDecoding(): boolean {
    return this.inner.supportsConstrainedDecoding();
  }

  async *generate(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    const input = fingerprint(request);
    const saved = this.replaying ? this.replay[this.calls.length] : undefined;
    if (saved && saved.input === input) {
      request.signal?.throwIfAborted();
      this.replayed++;
      this.record({ input, output: saved.output });
      yield { text: saved.output, done: false };
      yield { text: "", done: true };
      return;
    }
    // Out of saved replies, or the conversation took another turn: the real model from here on.
    this.replaying = false;
    let output = "";
    for await (const chunk of this.inner.generate(request)) {
      output += chunk.text;
      yield chunk;
    }
    this.record({ input, output });
  }

  private record(call: RecordedCall) {
    this.calls.push(call);
    this.onRecord?.([...this.calls]);
  }

  /** The wrapped model belongs to the caller, such as the page's shared browser model. */
  async dispose(): Promise<void> {}
}
