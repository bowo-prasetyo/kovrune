// The fields bench:endpoint adds to every request to the model server.
//
// llama-server reuses the cached start of the prompt it last processed (cache_prompt, on by default).
// The reply to the same request then depends on which tasks ran before it, so once one task changes,
// later tasks can change by chance, and a task run on its own (bench:replay's step 3) can differ from a
// full run (eval/field/README.md#the-prompt-cache-makes-a-task-depend-on-the-tasks-before-it). So
// benchmark runs turn it off unless asked to keep it: every request then processes the whole prompt,
// which is slower. Servers other than llama.cpp ignore the field.

/** The request fields for a benchmark run: --extra-body, with the prompt cache off unless promptCache or --extra-body says otherwise. */
export function benchExtraBody(extra: Record<string, unknown> | undefined, promptCache: boolean): Record<string, unknown> {
  if (promptCache || (extra && "cache_prompt" in extra)) return { ...extra };
  return { ...extra, cache_prompt: false };
}
