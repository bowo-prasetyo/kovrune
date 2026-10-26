// A research question in progress, saved after every model call so that it can
// resume after a reload, a crash or a lost connection to the model (M2 slice 2).
// How resuming works is in agent/replay.ts.

import type { RecordedCall } from "../../agent/replay.ts";
import type { SourcePrefs } from "./sources.ts";

export interface SavedTask {
  /** One task is saved at a time, under this ID. */
  id: typeof TASK_ID;
  question: string;
  /** The sources it searches, as ticked when it started. */
  prefs: SourcePrefs;
  /** The library documents it searches, in order. */
  documentIds: string[];
  /** The model setup it ran with, e.g. "Qwen3.5-4B on llama.cpp server". */
  setup: string;
  /** Model calls so far. */
  calls: RecordedCall[];
  /** The trace as shown so far. */
  steps: string[];
  /** ISO times. */
  startedAt: string;
  updatedAt: string;
  /** The error it stopped with, when it stopped with one rather than being cut off by a reload or crash. */
  error?: string;
}

export const TASK_ID = "current";

/** Whether a saved task can continue where it stopped, or only be asked again. */
export function resumability(
  task: SavedTask,
  now: { documentIds: string[]; setup: string },
): { resumable: true } | { resumable: false; reason: string } {
  const available = new Set(now.documentIds);
  const missing = task.documentIds.filter((id) => !available.has(id)).length;
  if (missing > 0) {
    return { resumable: false, reason: `${missing === 1 ? "a document it searched was" : `${missing} documents it searched were`} removed` };
  }
  if (task.setup !== now.setup) return { resumable: false, reason: `it ran with ${task.setup}` };
  return { resumable: true };
}

/** "after 3 steps", for the interrupted-question notice. */
export function describeProgress(task: SavedTask): string {
  const n = task.calls.length;
  return n === 0 ? "before its first step" : `after ${n} step${n === 1 ? "" : "s"}`;
}
