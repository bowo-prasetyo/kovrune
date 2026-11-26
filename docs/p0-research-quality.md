# P0 — Strengthen Research Quality and Trustworthiness

This package hardens the evidence and evaluation loop before adding new product surface area. It builds on Kovrune's existing quote verification, answer review, report completeness checks, benchmark suites, and browser benchmark.

## Scope

### 1. Accuracy metrics must not reward substring coincidences

Evaluation facts often contain short numbers, acronyms, units, or names. A substring check can incorrectly score `4` as present in `14`, `MPL` in `AMPL`, or `born` in `unborn`. The evaluation harness now uses case-insensitive, Unicode-normalized phrase matching with alphanumeric token boundaries. Punctuation remains significant, so decimals and version identifiers stay distinguishable.

The same matcher is used by retrieval passage recall and report-section scoring. This changes evaluation/scoring behavior only; it does not silently change production answer labels.

### 2. Research accuracy and evidence

Keep the current independent checks: verbatim quote verification, sentence support, answer review, and model-specific completeness checks. Do not collapse them into a single confidence score. Report each failure class separately:

- retrieval miss (the needed source or passage was not surfaced);
- unsupported or contradicted answer sentence;
- incomplete multi-part answer;
- citation/quote mismatch;
- correct abstention versus false reassurance.

Use held-out tasks for release comparisons. Do not tune a guard against the same examples used to claim its improvement.

### 3. Report intelligence

Use the report suite's expected-section coverage and factual correctness as separate measures. A plan that mentions a section is not proof that the final answer covers it. Track unmatched sections, incorrect sections labelled `Quotes found`, fallbacks, and cost/time as separate dimensions. The evaluation matcher rejects partial-token coincidences in both section keywords and facts.

### 4. Retrieval at realistic library sizes

Run the deterministic retrieval benchmark at baseline and with 100, 300, and 1,000 generated distractor documents:

```sh
npm run bench:retrieval
npm run bench:retrieval -- --distractors 100
npm run bench:retrieval -- --distractors 300
npm run bench:retrieval -- --distractors 1000
```

Record document recall, passage recall, and complete-task count per suite. Compare top-3 with top-5/top-10 before changing the production default. Do not introduce embeddings or hybrid retrieval unless the benchmark shows a repeatable improvement on held-out tasks without regressing precision or latency.

### 5. Browser runtime validation

The browser benchmark records runtime, exact model ID, context length, hardware class, browser/GPU/device metadata, model-load time, self-check, task results, and timings. A local-server result is not a substitute for a WebLLM result: quantization, kernels, browser memory pressure, and GPU support differ.

For the class-2 confirmation run:

1. Run the full research, unanswerable, and PDF suites on a 16 GB machine using the pinned WebLLM Qwen3.5-4B candidate.
2. Record browser/OS, CPU/GPU, device memory, cross-origin isolation, model ID, runtime, context, load time, decode/prefill speed, median task time, and all task results.
3. Repeat once after a clean reload; report both runs rather than selecting the better one.
4. Run the same model family through the local-server adapter when possible, and compare quality separately from speed.
5. Keep the browser path marked *unvalidated* on hardware classes without a completed report.

Start the runner with `npm run bench:browser`, open its local page, choose WebLLM, the pinned Qwen3.5-4B model, class 2, Full, Research + Unanswerable + PDF, and both decoding modes. The benchmark JSON is the source of truth. A quick preset or partial task-ID run is diagnostic only, not a release gate.

## Acceptance criteria

- [ ] Evaluation phrase matching has boundary regression tests for short numbers, acronyms, names, decimals, and Unicode compatibility forms.
- [ ] Research and PDF retrieval floors remain green; field/domain retrieval is reported separately.
- [ ] 100/300/1,000-distractor runs are captured and compared before changing retrieval strategy or result limits.
- [ ] Report plan coverage, final factual coverage, unmatched sections, and false reassurance are reported separately.
- [ ] Browser class-2 validation uses a full run, records the complete environment/model identity, and is repeated after a clean reload.
- [ ] No model/runtime is described as production-ready solely because it loads or passes a tool self-check.

## Non-goals

This P0 does not add a coding agent, collaboration/circles, cloud inference, telemetry, or a new vector database. It does not weaken quote verification or use an LLM judge as the only correctness signal.
